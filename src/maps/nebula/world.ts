import { FRAME_U, SAFE_U, UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { ENEMIES, SPAWN } from '../../data/enemies'
import { ENEMY_BODY } from '../../data/abilities'
import { MAPS } from '../../data/maps'
import { FRAME_MID } from '../frame'
import type { MapId, NebulaConfig } from '../../types/maps'
import { accrete, aroundCircle, endMeteor, feed, flyMeteor, gravityAt, inHorizon as inNebulaHorizon, keepInCavity, launchMeteor, makeNebula, pruneFlares, reachPx, settleSpot, spawnSpot, sweepContact } from './model'
import type { NebulaMeteor, NebulaState } from './model'
import { roomFor } from '../landmark'
import type { Landmark } from '../landmark'
import { query, removeEntity } from 'bitecs'
import { Alive, ENEMY_SET, Hp, Motion, MOTION, Phys, PICKUP_SET, PROJ_SET, Radius, Shard, Slot, Stats, Swarmer, Transform, Uid } from '../../ecs/components'
import { bodyRules } from '../../ecs/store'
import { hit } from '../../ecs/systems/shared/damage'
import { die } from '../../ecs/systems/shared/combat'
import { cullProjectile } from '../../ecs/systems/shared/projectile'
import { inTransit } from '../../ecs/utils/marks'
import { hazardSource } from '../../ecs/utils/source'
import type { Sim } from '../../ecs/sim'
import { leaderX, leaderY } from '../../ecs/utils/team'
import { bounded } from '../../ecs/worlds/hooks'
import type { WorldHooks } from '../../ecs/worlds/hooks'
import { hasTrait } from '../../ecs/utils/traits'

function clampToDisc(px: number, py: number, cx: number, cy: number, r: number): { x: number; y: number } {
  const dx = px - cx
  const dy = py - cy
  const d = Math.hypot(dx, dy)
  if (d <= r || d < 1e-6) return { x: px, y: py }
  const k = r / d
  return { x: cx + dx * k, y: cy + dy * k }
}

function nebulaCfg(sim: Sim): NebulaConfig {
  return MAPS[sim.mapId].nebula!
}

/** 星云的摆法由布景种子定下，视图开战前就按它摆镜头；黑洞的质量与流星由对局推进 */
function nebulaOf(sim: Sim): NebulaState {
  let s = sim.worldState.nebula
  if (!s) {
    s = makeNebula(nebulaCfg(sim), sim.run.decorSeed, FRAME_MID)
    sim.worldState.nebula = s
  }
  return s
}

/** 敌人的身体都一样：终端漂移按质量/阻力 */
const FOE_FALL = ENEMY_BODY.mass / ENEMY_BODY.drag
const SLOWEST = new Map<MapId, number>()

/** 这张图会刷出来的敌人里最慢的能走多快，格/秒 */
function slowestFoeU(sim: Sim): number {
  let v = SLOWEST.get(sim.mapId)
  if (v === undefined) {
    const def = MAPS[sim.mapId]
    v = Math.min(...def.foes.map((k) => ENEMIES[k].speed), ENEMIES[def.boss].speed)
    SLOWEST.set(sim.mapId, v)
  }
  return v
}

/** 刷怪点离黑洞至少多远，像素：这张图最慢的敌人此刻走不出来的半径，再加余量 */
function nebulaClearPx(sim: Sim): number {
  return reachPx(nebulaOf(sim), FOE_FALL, slowestFoeU(sim)) + nebulaCfg(sim).spawnClearU * UNIT
}

const ACCRETION_TINT = 0xffb36b
const METEOR_GLOW_TINT = 0xff8a3d
/** 流星撞碎后这么久里碎块还会被甩进空腔，毫秒；碎块从内壁往里这么远处甩出，格 */
const SHARDS_MS = 3000
const SHARDS_IN_U = 0.5

/** 吞下的身体折成多少 GM：按质量与半径的三次方 */
function bodyGm(cfg: NebulaConfig, eid: number): number {
  return cfg.swallow.bodyGm * Phys.mass[eid]! * (Radius.v[eid]! / (cfg.swallow.bodyRadiusU * UNIT)) ** 3
}

/** 不在活动的平面上：穿行中没有实体，跳起来的在空中 */
function offPlane(eid: number): boolean {
  return inTransit(eid) || Motion.kind[eid] === MOTION.arc
}

/** 中心进了视界的都被吞掉：角色倒下，敌人死去，掉落物、蜜蜂、碎片与弹体消失；吞下的质量让黑洞长大，放出的光能化作一阵闪耀 */
function swallowNebula(sim: Sim, s: NebulaState, cfg: NebulaConfig): void {
  const now = sim.elapsedMs
  const src = hazardSource('blackhole', ACCRETION_TINT)
  const st = sim.run.stats
  const inside = (eid: number): boolean => inNebulaHorizon(s, Transform.x[eid]!, Transform.y[eid]!)
  for (const m of sim.characters) {
    if (!Alive.v[m] || offPlane(m) || !inside(m)) continue
    const slot = Slot.v[m]!
    if (slot >= 0 && slot < st.damageTaken.length) st.damageTaken[slot] = (st.damageTaken[slot] ?? 0) + Hp.v[m]!
    st.hazardDamage.blackhole = (st.hazardDamage.blackhole ?? 0) + Hp.v[m]!
    const x = Transform.x[m]!
    const y = Transform.y[m]!
    const gm = bodyGm(cfg, m)
    die(sim, m, src, 0, 0)
    feed(s, cfg, gm, now, x, y)
  }
  for (const eid of [...query(sim.world, ENEMY_SET)]) {
    if (!Alive.v[eid] || offPlane(eid) || !inside(eid)) continue
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const gm = bodyGm(cfg, eid)
    die(sim, eid, src, 0, 0)
    feed(s, cfg, gm, now, x, y)
  }
  for (const eid of [...query(sim.world, PICKUP_SET)]) {
    if (!inside(eid)) continue
    feed(s, cfg, cfg.swallow.pickupGm, now, Transform.x[eid]!, Transform.y[eid]!)
    removeEntity(sim.world, eid)
  }
  for (const eid of [...query(sim.world, [Swarmer, Transform])]) {
    if (!inside(eid)) continue
    feed(s, cfg, bodyGm(cfg, eid), now, Transform.x[eid]!, Transform.y[eid]!)
    bodyRules[eid] = undefined
    removeEntity(sim.world, eid)
  }
  for (const eid of [...query(sim.world, [Shard, Transform])]) {
    if (inside(eid)) removeEntity(sim.world, eid)
  }
  for (const eid of [...query(sim.world, PROJ_SET)]) {
    if (!inside(eid)) continue
    feed(s, cfg, cfg.swallow.shotGm, now, Transform.x[eid]!, Transform.y[eid]!)
    cullProjectile(sim, eid)
  }
}

/**
 * 流星撞上身体：两者按完全非弹性碰撞交换动量，身体沿碰上那一刻的法线被撞开；
 * 伤害按碰撞损耗的动能，随法向相对速度的平方变，正面以 speedU 撞上时是 damage
 */
function strikeNebula(sim: Sim, cfg: NebulaConfig, m: NebulaMeteor, x0: number, y0: number): void {
  const mc = cfg.meteor
  const src = hazardSource('meteor', METEOR_GLOW_TINT)
  const meteorMass = mc.gm / cfg.swallow.bodyGm
  const ref = mc.speedU * UNIT
  const strike = (eid: number): void => {
    if (m.hit.has(Uid.v[eid]!) || offPlane(eid)) return
    const n = sweepContact(x0, y0, m.x, m.y, Transform.x[eid]!, Transform.y[eid]!, mc.radiusU * UNIT + Radius.v[eid]!)
    if (!n) return
    m.hit.add(Uid.v[eid]!)
    const vn = Math.max(0, (m.vx - Phys.vx[eid]!) * n.x + (m.vy - Phys.vy[eid]!) * n.y)
    const mass = Phys.mass[eid]!
    const j = ((meteorMass * mass) / (meteorMass + mass)) * vn
    hit(sim, src, eid, mc.damage * (vn / ref) ** 2, { tick: true, knockback: j, from: { x: Transform.x[eid]! - n.x, y: Transform.y[eid]! - n.y } })
  }
  for (const c of sim.characters) if (Alive.v[c]) strike(c)
  for (const eid of [...query(sim.world, ENEMY_SET)]) if (Alive.v[eid]) strike(eid)
}

/** 流星：到点在内壁上起预兆，预兆完冲进空腔，只受引力；扎进壳层被撕碎、掉进视界被吞掉、飞到时限散掉，之后隔一阵再来 */
function nebulaMeteors(sim: Sim, s: NebulaState, cfg: NebulaConfig, delta: number): void {
  const mc = cfg.meteor
  const now = sim.elapsedMs
  const m = s.meteor
  if (!m) {
    if (now >= s.meteorAt) s.meteor = launchMeteor(s, cfg, sim.rng, leaderX(sim), leaderY(sim), now)
    return
  }
  if (m.phase === 'warn') {
    if (now < m.since + mc.warnMs) return
    m.phase = 'fly'
    m.since = now
  }
  const x0 = m.x
  const y0 = m.y
  const end = flyMeteor(s, cfg, m, delta / 1000)
  strikeNebula(sim, cfg, m, x0, y0)
  if (!end && now - m.since < mc.maxFlightMs) return
  if (end === 'swallow') feed(s, cfg, mc.gm, now, m.x, m.y)
  if (end === 'shatter') s.shatter = { x: m.x, y: m.y, at: now }
  endMeteor(s, { kind: end ?? 'fade', x: m.x, y: m.y, vx: m.vx, vy: m.vy, at: now })
  s.meteor = null
  s.meteorAt = now + mc.intervalMs + (sim.rng.next() * 2 - 1) * mc.intervalJitterMs
}

/**
 * 视界：一团空心星云的空腔，没有墙。黑洞（Paczyński–Wiita 势）与壳层（牛顿壳层定理）的万有引力作用于一切，走进壳层的都被拉回空腔；
 * 中心进了视界的被吞掉，黑洞随吞下的质量长大；壳层不时甩出流星横穿空腔。敌人只顾着追人，头目会绕开自己走不出来的那一圈
 */
export const nebula: WorldHooks = {
  ...bounded,
  pull(sim, x, y) {
    return gravityAt(nebulaOf(sim), nebulaCfg(sim), x, y)
  },
  sink(sim, x, y) {
    return inNebulaHorizon(nebulaOf(sim), x, y)
  },
  /** 壳层平时就把人拉回来；被击退、冲刺或瞬移甩出去的也停在安全区的内切圆里 */
  constrainBody(sim, eid, _from, next) {
    const L = nebulaOf(sim).layout
    return clampToDisc(next.x, next.y, L.cx, L.cy, (FRAME_U / 2 - SAFE_U) * UNIT - Radius.v[eid]!)
  },
  chaseDir(sim, eid, tx, ty) {
    if (!hasTrait(sim.world, eid, 'wary')) return bounded.chaseDir(sim, eid, tx, ty)
    const s = nebulaOf(sim)
    const r = reachPx(s, Phys.mass[eid]! / Phys.drag[eid]!, Stats.moveSpeed[eid]!) + UNIT
    return aroundCircle(Transform.x[eid]!, Transform.y[eid]!, tx, ty, s.layout.hx, s.layout.hy, r)
  },
  wanderDir(sim, eid, dx, dy) {
    return keepInCavity(nebulaOf(sim), nebulaCfg(sim), Transform.x[eid]!, Transform.y[eid]!, dx, dy, Radius.v[eid]! + 0.6 * UNIT)
  },
  fleeDir(sim, eid, awayX, awayY) {
    return keepInCavity(nebulaOf(sim), nebulaCfg(sim), Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, Radius.v[eid]! + 1.5 * UNIT)
  },
  spawnPoint(sim, boss) {
    const near = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    return spawnSpot(nebulaOf(sim), nebulaCfg(sim), () => sim.rng.next(), nebulaClearPx(sim), (boss ? 2 : SPAWN.edgeInset) * UNIT, leaderX(sim), leaderY(sim), near)
  },
  center(sim) {
    const L = nebulaOf(sim).layout
    return { x: L.cx, y: L.cy }
  },
  settle(sim, p) {
    return settleSpot(nebulaOf(sim), nebulaCfg(sim), p.x, p.y, nebulaClearPx(sim), SPAWN.edgeInset * UNIT)
  },
  ground(sim) {
    return nebulaOf(sim).cavity
  },
  /** 和刷怪点一样：在空腔里离内壁留得出身体，离黑洞在最慢的敌人走得出来的地方 */
  canSpawn(sim, x, y, radius) {
    const s = nebulaOf(sim)
    return roomFor(s.cavity, x, y, radius) && Math.hypot(x - s.layout.hx, y - s.layout.hy) >= nebulaClearPx(sim)
  },
  /** 黑洞边上这具身体走不出来的那一圈，识险的敌人绕开的也是它 */
  harms(sim, eid, x, y) {
    const s = nebulaOf(sim)
    return Math.hypot(x - s.layout.hx, y - s.layout.hy) < reachPx(s, Phys.mass[eid]! / Phys.drag[eid]!, Stats.moveSpeed[eid]!) + UNIT
  },
  /**
   * hole 是黑洞；meteor 是刚撞碎在壳层上的流星，碎块从那里的内壁甩进来，撞碎后一阵就没了；
   * horizon 是黑洞朝着队长那一侧、最慢的敌人刚好走得出来的地方，朝着队长
   */
  landmarks(sim) {
    const s = nebulaOf(sim)
    const L = s.layout
    const sh = s.shatter
    const meteor: Landmark[] = []
    if (sh && sim.elapsedMs - sh.at <= SHARDS_MS) {
      const ox = sh.x - L.cx
      const oy = sh.y - L.cy
      const d = Math.hypot(ox, oy) || 1
      const r = (nebulaCfg(sim).shell.innerU - SHARDS_IN_U) * UNIT
      meteor.push({ x: L.cx + (ox / d) * r, y: L.cy + (oy / d) * r, r: 0, nx: -ox / d, ny: -oy / d })
    }
    const lx = leaderX(sim) - L.hx
    const ly = leaderY(sim) - L.hy
    const away = Math.hypot(lx, ly) > 1e-6 ? norm(lx, ly) : norm(L.cx - L.hx, L.cy - L.hy)
    const clear = nebulaClearPx(sim)
    return {
      hole: [{ x: L.hx, y: L.hy, r: 0, nx: 0, ny: 0 }],
      meteor,
      horizon: [{ x: L.hx + away.x * clear, y: L.hy + away.y * clear, r: 0, nx: away.x, ny: away.y }],
    }
  },
  /** 黑洞从开局的质量长到上限走了几成 */
  gauge(sim, g) {
    const h = nebulaCfg(sim).hole
    return g === 'mass' ? Math.min(1, Math.max(0, (nebulaOf(sim).gm - h.gm) / (h.maxGm - h.gm))) : 0
  },
  /** 关卡要一颗流星：空中没有流星就立刻在内壁上起预兆，有就照旧 */
  cue(sim, c) {
    const s = nebulaOf(sim)
    if (c === 'meteor' && !s.meteor) s.meteorAt = sim.elapsedMs
  },
  onStart(sim) {
    nebulaOf(sim)
  },
  tick(sim, delta) {
    const cfg = nebulaCfg(sim)
    const s = nebulaOf(sim)
    accrete(s, cfg, delta / 1000)
    swallowNebula(sim, s, cfg)
    nebulaMeteors(sim, s, cfg, delta)
    pruneFlares(s, cfg, sim.elapsedMs)
  },
}
