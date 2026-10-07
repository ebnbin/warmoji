import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { SPAWN } from '../../data/enemies'
import { ENEMY_BODY } from '../../data/abilities'
import { MAPS } from '../../data/maps'
import { FRAME_MID, SAFE } from '../frame'
import type { FloeConfig } from '../../types/maps'
import { roomFor } from '../landmark'
import { ashore, bulk, edgeAt, FALLING, fallTime, floeFor, footingOf, frictionAt, GRAVITY, gustSpan, heightAt, ICE, inWater, newFloe, seaward, slideLoose, standing, stepInWater, stepOnIce, SWIMMING, windAt, windPush } from './model'
import type { FloeField, FloeState } from './model'
import { hasComponent, query, removeEntity } from 'bitecs'
import { Alive, Drive, ENEMY_SET, GrantCoins, Hp, Motion, Phys, Pickup, Radius, Shard, Span, Transform, Uid } from '../../ecs/components'
import { hit } from '../../ecs/systems/shared/damage'
import { inTransit } from '../../ecs/utils/marks'
import { hazardSource } from '../../ecs/utils/source'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'
import { leaderX, leaderY } from '../../ecs/utils/team'
import { approach } from '../../ecs/systems/shared/body'
import { bounded, GROUND, groundOf } from '../../ecs/worlds/hooks'
import { mapEvent } from '../../ecs/fight/events'
import type { WorldHooks } from '../../ecs/worlds/hooks'

function floeCfg(sim: Sim): FloeConfig {
  return MAPS[sim.mapId].floe!
}

/** 浮冰的形状由布景种子定下，视图从这里读；阵风哪一刻来、偏多少由对局的随机数定 */
function floeOf(sim: Sim): FloeState {
  let s = sim.worldState.floe
  if (!s) {
    const cfg = floeCfg(sim)
    s = newFloe(floeFor(sim.run.decorSeed, cfg), cfg)
    sim.worldState.floe = s
  }
  return s
}

const WATER_TINT = 0x4fc3f7
/** 冰上的路多久按队长的位置重铺一次，毫秒 */
const PATH_MS = 250
/** 直线走过去时，沿途离冰缘至少留多远，格；目标本身离冰缘更近就按目标的算 */
const LINE_CLEAR_U = 0.35
/** 离目标这么近（格）就直扑过去：冰缘边上的目标也够得着，扑过头就滑进海里 */
const LUNGE_U = 1.5
/** 漂在水上的小东西随海流漂：速度朝海流靠拢的速率，每秒 */
const FLOAT_K = 2
/** 此刻的风推得动的身体落在离冰缘再远这么多的地方，格：免得一落地就被吹下海 */
const BLOWN_U = 1

/** 离冰缘 reach 格以内还朝着海走，就改为顺着冰缘走；正对着海时转向一侧 */
function alongEdge(f: FloeField, x: number, y: number, dx: number, dy: number, reach: number): Point {
  if (edgeAt(f, x, y) > reach) return { x: dx, y: dy }
  const n = seaward(f, x, y)
  const out = dx * n.x + dy * n.y
  if (out <= 0) return { x: dx, y: dy }
  const tx = dx - out * n.x
  const ty = dy - out * n.y
  const l = Math.hypot(tx, ty)
  return l > 1e-3 ? { x: tx / l, y: ty / l } : { x: -n.y, y: n.x }
}

/** 两点之间的直线一路都在冰上、离冰缘留得出 clear 格 */
function clearLine(f: FloeField, x: number, y: number, tx: number, ty: number, clear: number): boolean {
  const n = Math.ceil(Math.hypot(tx - x, ty - y) / (0.5 * UNIT))
  for (let k = 1; k <= n; k++) if (edgeAt(f, x + ((tx - x) * k) / n, y + ((ty - y) * k) / n) < clear) return false
  return true
}

/** 在冰上从 (x, y) 去 (tx, ty)：贴近了直扑；看得到就直走；隔着水就顺着冰上的路绕（路通往队长那里），否则贴着冰缘走 */
function walkTo(s: FloeState, x: number, y: number, tx: number, ty: number, reach: number): Point {
  const f = s.field
  const d = norm(tx - x, ty - y)
  if (Math.hypot(tx - x, ty - y) < LUNGE_U * UNIT) return d
  if (clearLine(f, x, y, tx, ty, Math.min(LINE_CLEAR_U, edgeAt(f, tx, ty)))) return alongEdge(f, x, y, d.x, d.y, reach)
  const src = s.paths.source
  if (src >= 0) {
    const c = s.paths.center(src)
    if (Math.hypot(c.x - tx, c.y - ty) < 3 * UNIT) {
      const down = s.paths.downhill(x, y)
      if (down) return down
    }
  }
  return alongEdge(f, x, y, d.x, d.y, reach)
}

/** 阵风：到点就起下一轮，风向偏一点；一轮没落尽不起新的 */
function tickGust(sim: Sim, s: FloeState, cfg: FloeConfig): void {
  const w = cfg.wind
  const now = sim.elapsedMs
  if (now < s.nextGust) return
  s.gust = { at: now, veer: (sim.rng.next() * 2 - 1) * w.veerDeg * (Math.PI / 180) }
  s.nextGust = now + Math.max(gustSpan(w), w.intervalMs + (sim.rng.next() * 2 - 1) * w.jitterMs)
  mapEvent(sim, 'gust')
}

/** 泡在冰水里的按体温往下掉血：冻僵的时长与体型成正比（散热按表面积、热容按体积），满血的标准身体 freezeSec 秒冻死 */
function chill(sim: Sim, s: FloeState, cfg: FloeConfig): void {
  const now = sim.elapsedMs
  if (now < s.hurtAt) return
  s.hurtAt = now + cfg.coldTickMs
  const src = hazardSource('coldWater', WATER_TINT)
  const frac = cfg.coldTickMs / 1000
  const freeze = (eid: number): void => {
    if (!Alive.v[eid] || inTransit(eid) || !inWater(s, eid, Uid.v[eid]!)) return
    const t = cfg.body.freezeSec * bulk(cfg, Radius.v[eid]!, Phys.mass[eid]!)
    hit(sim, src, eid, Math.max(1, Math.round((Hp.max[eid]! * frac) / t)), { tick: true })
  }
  for (const m of sim.characters) freeze(m)
  for (const eid of [...query(sim.world, ENEMY_SET)]) freeze(eid)
}

/** 掉进海里的金币沉下去；别的掉落物浮着，随海流漂 */
function sinkCoins(sim: Sim, s: FloeState): void {
  for (const eid of [...query(sim.world, [Pickup, GrantCoins, Transform])]) {
    if (!inWater(s, eid, Uid.v[eid]!)) continue
    s.splashes.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, r: Radius.v[eid]!, at: sim.elapsedMs, sink: true })
    removeEntity(sim.world, eid)
  }
}

/** 冰上的路按队长的位置重铺：队长在水里就通往离他最近的冰 */
function tickPaths(sim: Sim, s: FloeState): void {
  if (sim.elapsedMs < s.pathAt) return
  s.pathAt = sim.elapsedMs + PATH_MS
  const c = s.paths.nearest(leaderX(sim), leaderY(sim))
  if (c !== s.paths.source) s.paths.build(c)
}

/** 复活落座、跳跃这类脚本位移不走 contact：被它从水里带上冰的，脚下改回冰上 */
function landed(s: FloeState, cfg: FloeConfig): void {
  for (const [eid, foot] of s.feet) {
    if (foot.mode !== SWIMMING || Uid.v[eid] !== foot.uid) continue
    if (edgeAt(s.field, Transform.x[eid]!, Transform.y[eid]!) * UNIT < Radius.v[eid]! * cfg.body.climbFrac) continue
    foot.mode = ICE
    foot.slip = true
  }
}

/**
 * 浮冰：南极海上一块没有边的浮冰。冰上一切按库仑摩擦走、滑、停，摩擦随积雪、老冰、新冰变，阵风按风压推着身体；
 * 重心探出冰缘就掉进海里，水里按二次阻力与推力游、随海流漂，游到冰缘爬上来；泡在冰水里的按体型冻得掉血，金币沉底。
 * 海上游到安全区的边就被一堵看不见的墙挡住，敌我都一样
 */
export const floe: WorldHooks = {
  ...bounded,
  surface(sim, x, y) {
    if (edgeAt(floeOf(sim).field, x, y) >= 0) return groundOf(sim)
    const cfg = floeCfg(sim)
    return { ...GROUND, exertion: cfg.waterExertion, regen: cfg.waterRegen }
  },
  /**
   * 一步：站在冰上的按摩擦与风走；重心撑不住就从冰缘往下掉，掉的这一下不受摩擦；落进水里按阻力与推力游，重心爬过冰缘一截就上了冰。
   * 自己发动的冲刺、跳跃由能力推着走、也由能力刹住，收尾时还回冲之前的速度；被打飞、被扔出去的照样带着速度滑
   */
  contact(sim, eid, dt, x, y, vx, vy, out) {
    const cfg = floeCfg(sim)
    const s = floeOf(sim)
    const f = s.field
    const foot = footingOf(s, eid, Uid.v[eid]!)
    if (foot.at >= 0 && hasComponent(sim.world, eid, Motion) && Motion.self[eid] === 1 && Motion.stamp[eid]! >= foot.at) {
      vx = foot.vx
      vy = foot.vy
    }
    const g = (GRAVITY / cfg.meterPerU) * UNIT
    const r = Radius.v[eid]!
    const footR = r * cfg.body.footFrac
    const pickup = hasComponent(sim.world, eid, Pickup)
    const loose = pickup || hasComponent(sim.world, eid, Shard)
    const dx = Drive.x[eid]!
    const dy = Drive.y[eid]!
    const pulled = pickup && (dx !== 0 || dy !== 0)
    const k = (Phys.drag[eid]! * Phys.grip[eid]!) / Phys.mass[eid]!
    if (foot.mode === ICE && !standing(f, x, y, footR)) {
      foot.mode = FALLING
      foot.fall = 0
      foot.drop = foot.h
    }
    if (foot.mode === FALLING) {
      out.x = x + vx * dt
      out.y = y + vy * dt
      out.vx = vx
      out.vy = vy
      foot.fall += dt
      if (standing(f, out.x, out.y, footR)) foot.mode = ICE
      else if (foot.fall >= fallTime(foot.drop)) {
        foot.mode = SWIMMING
        if (!loose) s.splashes.push({ x: out.x, y: out.y, r, at: sim.elapsedMs, sink: false })
      }
    } else if (foot.mode === SWIMMING) {
      if (pulled) approach(out, x, y, vx, vy, dx, dy, k, dt)
      else if (loose) approach(out, x, y, vx, vy, s.current.x, s.current.y, FLOAT_K, dt)
      else {
        const len = cfg.body.dragU * UNIT * bulk(cfg, r, Phys.mass[eid]!)
        const sp = Math.hypot(dx, dy)
        const swim = sp * cfg.body.swimRatio
        stepInWater(out, x, y, vx, vy, sp > 0 ? dx / sp : 0, sp > 0 ? dy / sp : 0, (swim * swim) / len, len, s.current.x, s.current.y, dt)
      }
      if (edgeAt(f, out.x, out.y) * UNIT >= r * cfg.body.climbFrac) {
        foot.mode = ICE
        foot.slip = true
      }
    } else {
      const t = sim.hooks.surface(sim, x, y).traction
      if (pulled) approach(out, x, y, vx, vy, dx, dy, k, dt)
      else if (loose) slideLoose(out, x, y, vx, vy, cfg.friction.loose * t, g, dt)
      else {
        const mu = frictionAt(f, cfg, x, y)
        const w = windAt(f, cfg, s.gust, sim.elapsedMs)
        const push = windPush(cfg, w.speed, w.angle, vx, vy, bulk(cfg, r, Phys.mass[eid]!))
        stepOnIce(out, foot, x, y, vx, vy, dx, dy, k, mu.s * t, mu.k * t, g, push.x, push.y, dt)
      }
      foot.h = heightAt(f, out.x, out.y)
    }
    foot.at = Math.fround(sim.elapsedMs)
    foot.vx = out.vx
    foot.vy = out.vy
    return true
  },
  constrainBody(_sim, eid, _from, next) {
    const r = Radius.v[eid]!
    return {
      x: Math.min(Math.max(next.x, SAFE.x + r), SAFE.x + SAFE.w - r),
      y: Math.min(Math.max(next.y, SAFE.y + r), SAFE.y + SAFE.h - r),
    }
  },
  chaseDir(sim, eid, tx, ty) {
    const s = floeOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (inWater(s, eid, Uid.v[eid]!) || Span.lo[eid]! > 0) return norm(tx - x, ty - y)
    const reach = Radius.v[eid]! / UNIT + 0.6
    if (edgeAt(s.field, tx, ty) >= 0) return walkTo(s, x, y, tx, ty, reach)
    // 目标在水里：不跟着跳下去，走到离它最近的冰上守着
    const c = s.paths.nearest(tx, ty)
    if (c < 0) return { x: 0, y: 0 }
    const p = s.paths.center(c)
    if (Math.hypot(p.x - x, p.y - y) < 0.5 * UNIT) return { x: 0, y: 0 }
    return walkTo(s, x, y, p.x, p.y, reach)
  },
  wanderDir(sim, eid, dx, dy) {
    const f = floeOf(sim).field
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (edgeAt(f, x, y) > Radius.v[eid]! / UNIT + 1.2) return { x: dx, y: dy }
    const n = seaward(f, x, y)
    const dot = dx * n.x + dy * n.y
    return dot <= 0 ? { x: dx, y: dy } : { x: dx - 2 * dot * n.x, y: dy - 2 * dot * n.y }
  },
  fleeDir(sim, eid, awayX, awayY) {
    return alongEdge(floeOf(sim).field, Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, Radius.v[eid]! / UNIT + 1.5)
  },
  spawnPoint(sim, boss) {
    const f = floeOf(sim).field
    const min = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    const inset = boss ? 3 : 1.5
    const lx = leaderX(sim)
    const ly = leaderY(sim)
    let p: Point = FRAME_MID
    for (let i = 0; i < 48; i++) {
      const q = { x: sim.rng.next() * sim.mapW, y: sim.rng.next() * sim.mapH }
      if (edgeAt(f, q.x, q.y) < inset) continue
      p = q
      if (Math.hypot(q.x - lx, q.y - ly) >= min) break
    }
    return p
  },
  center() {
    return FRAME_MID
  },
  settle(sim, p) {
    return ashore(floeOf(sim).field, p.x, p.y, SPAWN.edgeInset)
  },
  ground(sim) {
    return floeOf(sim).ground
  },
  /** 落在冰上离冰缘留得出身体；此刻的风推得动它的地方（光冰、新冰）离冰缘再多留一截 */
  canSpawn(sim, x, y, radius) {
    const s = floeOf(sim)
    if (!roomFor(s.ground, x, y, radius)) return false
    const cfg = floeCfg(sim)
    const w = windAt(s.field, cfg, s.gust, sim.elapsedMs)
    const push = windPush(cfg, w.speed, w.angle, 0, 0, bulk(cfg, radius, ENEMY_BODY.mass))
    const hold = frictionAt(s.field, cfg, x, y).s * (GRAVITY / cfg.meterPerU) * UNIT
    return Math.hypot(push.x, push.y) <= hold || roomFor(s.ground, x, y, radius + BLOWN_U * UNIT)
  },
  /** 关卡要它起风：立刻起一阵新的，正刮着的也从头再起 */
  cue(sim, c) {
    if (c === 'gust') floeOf(sim).nextGust = sim.elapsedMs
  },
  landmarks(sim) {
    return floeOf(sim).marks
  },
  /** 往上风偏，偏多少按此刻的风速（米/秒）：风从哪边来，从哪边冰缘爬上来的就多 */
  lean(sim) {
    const s = floeOf(sim)
    const w = windAt(s.field, floeCfg(sim), s.gust, sim.elapsedMs)
    return { x: -Math.cos(w.angle) * w.speed, y: -Math.sin(w.angle) * w.speed }
  },
  onStart(sim) {
    floeOf(sim)
  },
  tick(sim) {
    const cfg = floeCfg(sim)
    const s = floeOf(sim)
    tickGust(sim, s, cfg)
    tickPaths(sim, s)
    landed(s, cfg)
    chill(sim, s, cfg)
    sinkCoins(sim, s)
    if (s.splashes.length > 64) s.splashes.splice(0, s.splashes.length - 64)
  },
}
