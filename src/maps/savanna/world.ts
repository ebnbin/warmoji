import { addComponent, hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { OBSTACLES } from '../../data/obstacles'
import { playSfx } from '../../audio/sfx'
import { Alive, Boss, Depth, ENEMY_SET, Faction, Hp, Phasing, Prop, Radius, Span, Sprite, Tint, Transform, Uid, VisOff } from '../../ecs/components'
import { attachDrawable } from '../../ecs/entities/drawable'
import { newEntity } from '../../ecs/entities/entity'
import { enemyZ } from '../../ecs/entities/enemy'
import { hit } from '../../ecs/systems/shared/damage'
import { displace, FORCED } from '../../ecs/systems/shared/displace'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { ART } from '../../ecs/utils/ground'
import { inTransit } from '../../ecs/utils/marks'
import { grounded, LAYER_M, loOf, passCost, probeZ } from '../../ecs/utils/pass'
import { hazardSource } from '../../ecs/utils/source'
import { leaderPoint, leaderY } from '../../ecs/utils/team'
import { bounded } from '../../ecs/worlds/hooks'
import { makeSolids, solidOf, solidsTrace } from '../../ecs/worlds/solids'
import { alongWall, awayFromWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { lumpGap, savannaPlan } from './layout'
import { newHerd, panic, scare, stepHerd } from './herd'
import type { Beast, Herd } from './herd'
import type { SavannaPlan } from './layout'
import type { Crossing, Probe } from '../../ecs/utils/pass'
import type { SavannaConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { Solid, Solids } from '../../ecs/worlds/solids'
import type { WorldHooks } from '../../ecs/worlds/hooks'

/** 水坑按布景种子打散出自己的种子，兽群开局怎么站再打散一次 */
const PLAN_SEED = 0x5a7a11
const HERD_SEED = 0x7e4d93
/** 踩踏的伤害数字与受伤闪的颜色：红土 */
const TRAMPLE_TINT = 0xc56a3c
/** 子弹按身体半径的这么多倍挡：emoji 的轮廓比圆小一圈 */
const HIT_SHRINK = 0.9
/** 动物的脚踩在离身体中心往下半径的这么多倍处 */
const FOOT = 0.55
/** 子弹打在离动物身体这么近（格）以内就算打中了它 */
const HIT_REACH_U = 0.6
/** 一头身边离它这么近（格）的身体算挤着它 */
const CROWD_U = 0.12
/** 挨打的动物闪白多久，毫秒 */
const FLINCH_MS = 90
/** 惊慌涨过它，平时的动物就抬起头张望 */
const UNEASY = 0.35
/** 绕开动物：往前看多远（格），绕的时候离它多远（格） */
const LOOK_U = 2.6
const CLEAR_U = 0.35

/** 水坑此刻：按种子定下的草地、它的实心，兽群与画它们的实体，水坑自己的钟（毫秒，时停时不走），见过的头目 */
export interface SavannaState {
  readonly plan: SavannaPlan
  readonly solids: Solids
  readonly herd: Herd
  readonly eids: readonly number[]
  clock: number
  readonly bosses: Set<number>
}

function cfgOf(sim: Sim): SavannaConfig {
  return MAPS[sim.mapId].savanna!
}

/** 这一局的草地：视图与规则按同一个种子各要一次 */
export function savannaPlanFor(cfg: SavannaConfig, decorSeed: number): SavannaPlan {
  return savannaPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

const SCRUB: Solid = { topM: Infinity, material: 'wood' }
const HILL: Solid = { topM: Infinity, material: 'rock' }

/** 深草丛与刺灌丛高过一切；山丘的石头按各自的高，石头后面一直高上去；蚁丘、枯树与金合欢的树干按各自的高；水上什么也不挡 */
function solidsOf(plan: SavannaPlan): Solids {
  const f = plan.field
  const rocks = [...plan.kopje.front, ...plan.kopje.back]
  const at = (x: number, y: number): Solid | null => {
    const gx = x / UNIT
    const gy = y / UNIT
    let top = 0
    for (const r of rocks) if (Math.hypot(gx - r.x, gy - r.y) < r.r) top = Math.max(top, r.h)
    if (top > 0) return { topM: top, material: 'rock' }
    if (roomAt(f, x, y) < 0) return lumpGap(rocks, gx, gy) < 2 ? HILL : SCRUB
    for (const m of plan.mounds) if (Math.hypot(gx - m.x, gy - m.y) < m.r) return { topM: m.h, material: 'earth' }
    for (const s of plan.snags) if (Math.hypot(gx - s.x, gy - s.y) < s.r) return { topM: s.h, material: 'wood' }
    for (const a of plan.acacias) if (Math.hypot(gx - a.x, gy - a.y) < a.r) return { topM: a.h, material: 'wood' }
    return null
  }
  return makeSolids(at, f.x0, f.y0, f.cols, f.rows, f.cell)
}

/** 一头动物的贴图边长，像素 */
export function beastSize(cfg: SavannaConfig, b: Beast): number {
  return b.r * cfg.herd.kinds[b.kind]!.art
}

export function savannaOf(sim: Sim): SavannaState {
  let s = sim.worldState.savanna
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = savannaPlanFor(cfg, sim.run.decorSeed)
    const herd = newHerd(cfg, plan, (sim.run.decorSeed ^ HERD_SEED) >>> 0, cfg.clearU)
    const eids = herd.beasts.map((b) => {
      const eid = newEntity(sim.world)
      attachDrawable(sim.world, eid, sim.frames, { id: cfg.herd.kinds[b.kind]!.emoji, outline: 'player', x: b.x, y: b.y, size: beastSize(cfg, b), flipX: b.face > 0, z: enemyZ(0) })
      addComponent(sim.world, eid, Prop)
      return eid
    })
    s = { plan, solids: solidsOf(plan), herd, eids, clock: 0, bosses: new Set() }
    sim.worldState.savanna = s
  }
  return s
}

/** 半径 r（像素）的身体挡在兽群外：压进哪一头就顺着它往外推出来，正压在中心时顺着它跑的方向往旁边推 */
function outOfHerd(h: Herd, x: number, y: number, r: number, skip: (b: Beast) => boolean): Point {
  let px = x
  let py = y
  for (const b of h.beasts) {
    if (skip(b)) continue
    const dx = px - b.x
    const dy = py - b.y
    const min = b.r + r
    const d2 = dx * dx + dy * dy
    if (d2 >= min * min) continue
    const d = Math.sqrt(d2)
    let nx = dx / d
    let ny = dy / d
    if (d < 1e-3) {
      const v = Math.hypot(b.vx, b.vy) || 1
      nx = -b.vy / v || 1
      ny = b.vx / v
    }
    px = b.x + nx * min
    py = b.y + ny * min
  }
  return { x: px, y: py }
}

/** (x, y) 离兽群最近的那一头的身体多远，像素，压在身上为负 */
function herdGap(h: Herd, x: number, y: number): number {
  let d = Infinity
  for (const b of h.beasts) d = Math.min(d, Math.hypot(x - b.x, y - b.y) - b.r)
  return d
}

/** 线段 a→b（像素）上先碰上的那一头：从它外面进去、探测在那一截低过它的高才算；子弹从身体里打出来的不挡 */
function herdTrace(h: Herd, probe: Probe, ax: number, ay: number, bx: number, by: number): Crossing | null {
  if (passCost(probe, 'beast') <= 0) return null
  const dx = bx - ax
  const dy = by - ay
  const A = dx * dx + dy * dy
  if (A < 1e-9) return null
  let best: Crossing | null = null
  for (const b of h.beasts) {
    const r = b.r * HIT_SHRINK
    const fx = ax - b.x
    const fy = ay - b.y
    const B = 2 * (fx * dx + fy * dy)
    const C = fx * fx + fy * fy - r * r
    if (C <= 0) continue
    const disc = B * B - 4 * A * C
    if (disc <= 0) continue
    const s = Math.sqrt(disc)
    const t0 = (-B - s) / (2 * A)
    const t1 = (-B + s) / (2 * A)
    if (t0 > 1 || t0 < 0) continue
    if (best && t0 >= best.t0) continue
    const e = Math.min(1, t1)
    if (Math.min(probeZ(probe, t0), probeZ(probe, e)) >= b.h) continue
    best = { t0, t1: e, material: 'beast' }
  }
  return best
}

/** 朝 d 走的身体（半径 r 像素）前面要是挡着一头，就从它离得近的那一侧绕过去 */
function aroundHerd(h: Herd, x: number, y: number, d: Point, r: number): Point {
  let best: Beast | null = null
  let bestT = LOOK_U * UNIT
  for (const b of h.beasts) {
    const ox = b.x - x
    const oy = b.y - y
    const t = ox * d.x + oy * d.y
    if (t <= 0 || t > bestT + b.r) continue
    const side = Math.abs(ox * d.y - oy * d.x)
    if (side > b.r + r + CLEAR_U * UNIT) continue
    best = b
    bestT = t
  }
  if (!best) return d
  const ox = best.x - x
  const oy = best.y - y
  const cross = d.x * oy - d.y * ox
  const s = cross > 0 ? -1 : 1
  const dist = Math.hypot(ox, oy) || 1
  const reach = best.r + r + CLEAR_U * UNIT
  const k = Math.min(1, reach / dist)
  const tx = -oy / dist
  const ty = ox / dist
  return norm(d.x * (1 - k) + tx * s * k * 1.4, d.y * (1 - k) + ty * s * k * 1.4)
}

/** 朝 d 游荡的身体碰上兽群就照镜子弹回去 */
function offHerd(h: Herd, x: number, y: number, d: Point, r: number): Point {
  for (const b of h.beasts) {
    const ox = x - b.x
    const oy = y - b.y
    const dist = Math.hypot(ox, oy) || 1
    if (dist > b.r + r + 0.6 * UNIT) continue
    const nx = ox / dist
    const ny = oy / dist
    const dot = d.x * nx + d.y * ny
    if (dot < 0) return { x: d.x - 2 * dot * nx, y: d.y - 2 * dot * ny }
  }
  return d
}

/** 草地上离边与障碍至少 room 像素、不压着兽群的一点：从 p 往外一圈圈找，近处找不到就退回开局站位 */
function openNear(s: SavannaState, p: Point, room: number): Point {
  for (let r = 0; r <= 10 * UNIT; r += 0.5 * UNIT) {
    const n = r === 0 ? 1 : Math.ceil((r * Math.PI * 2) / (0.5 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      if (roomAt(s.plan.basin, q.x, q.y) >= room && herdGap(s.herd, q.x, q.y) >= room) return q
    }
  }
  return { x: s.plan.start.x * UNIT, y: s.plan.start.y * UNIT }
}

/** 能被兽群挤、被踩的身体：活着、脚沾着地、不在穿行、不是穿墙的 */
function* bodies(sim: Sim): Generator<number> {
  for (const eid of query(sim.world, [Faction, Radius, Hp, Transform])) {
    if (!Alive.v[eid] || inTransit(eid) || !grounded(sim.world, eid) || hasComponent(sim.world, eid, Phasing)) continue
    yield eid
  }
}

/** 身边挤着的身体：一头身边多过 crowdFree 个时，多出来的每个每秒让惊慌涨 crowd，惊扰算在那一头身上 */
function crowding(sim: Sim, s: SavannaState, cfg: SavannaConfig, dt: number): void {
  const h = s.herd
  for (const b of h.beasts) b.crowd = 0
  for (const eid of bodies(sim)) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const r = Radius.v[eid]!
    for (const b of h.beasts) {
      const reach = b.r + r + CROWD_U * UNIT
      if ((x - b.x) ** 2 + (y - b.y) ** 2 <= reach * reach) b.crowd++
    }
  }
  for (const b of h.beasts) {
    const over = b.crowd - cfg.fear.crowdFree
    if (over > 0) scare(h, cfg, b.x, b.y, over * cfg.fear.crowd * dt, s.clock)
  }
}

/**
 * 狂奔的动物撞上的身体：同一趟里一头只撞同一个身体一次；挨标准身体满血 damage 的伤害，个头越大按半径的平方挨得越少；
 * 顺着它跑的方向、往跑道外头被顶开，同样的冲量，越重的飞得越近
 */
function trample(sim: Sim, s: SavannaState, cfg: SavannaConfig): void {
  const h = s.herd
  if (h.phase !== 'run' && h.phase !== 'slow') return
  const st = cfg.stampede
  const ref = OBSTACLES.body.refRadiusU * UNIT
  const src = hazardSource('trample', TRAMPLE_TINT)
  let thud = false
  for (const b of h.beasts) {
    const sp = Math.hypot(b.vx, b.vy)
    if (sp < b.run * st.trample) continue
    const hx = b.vx / sp
    const hy = b.vy / sp
    for (const eid of bodies(sim)) {
      const uid = Uid.v[eid]!
      if (b.struck.has(uid)) continue
      const x = Transform.x[eid]!
      const y = Transform.y[eid]!
      const r = Radius.v[eid]!
      const reach = b.r + r + CROWD_U * UNIT
      if ((x - b.x) ** 2 + (y - b.y) ** 2 > reach * reach) continue
      b.struck.add(uid)
      const size = Math.min(1, (ref / Math.max(ref, r)) ** 2)
      hit(sim, src, eid, Math.max(1, Math.round(Hp.max[eid]! * st.damage * size)), { tags: 0 })
      const side = (x - b.x) * -hy + (y - b.y) * hx >= 0 ? 1 : -1
      const d = norm(hx * 0.8 - hy * side, hy * 0.8 + hx * side)
      displace(sim, eid, { kind: 'push', x: d.x * st.tossU * UNIT, y: d.y * st.tossU * UNIT }, FORCED)
      sim.out.bursts.push({ x, y, count: 6, kind: 'dust' })
      thud = true
    }
  }
  if (thud) playSfx('thud')
}

/** 头目一登场，兽群立刻受惊，背着它跑 */
function watchBosses(sim: Sim, s: SavannaState, cfg: SavannaConfig): void {
  for (const e of query(sim.world, ENEMY_SET)) {
    if (!Boss.v[e] || !Alive.v[e] || s.bosses.has(Uid.v[e]!)) continue
    s.bosses.add(Uid.v[e]!)
    panic(s.herd, cfg, sim.rng, Transform.x[e]!, Transform.y[e]!, s.clock)
  }
}

/** 画兽群的实体跟上每一头：脚踩在身体中心往下一点；走着一颠一颠，吃草喝水时低头，不安时抬头张望，预警时扬起头刨地，狂奔时上下窜；挨打闪白。转角为正时朝左的头往上抬 */
function pose(sim: Sim, s: SavannaState, cfg: SavannaConfig): void {
  const h = s.herd
  const ly = leaderY(sim)
  const now = s.clock
  h.beasts.forEach((b, i) => {
    const eid = s.eids[i]!
    const size = beastSize(cfg, b)
    const sp = Math.hypot(b.vx, b.vy) / UNIT
    const t = b.phase
    let rot = 0
    let up = 0
    if (h.phase === 'alarm') {
      const k = Math.min(1, (now - h.at) / 300)
      rot = -(0.16 * k + Math.sin(now / 38 + i) * 0.035) * b.face
      up = Math.abs(Math.sin(now / 90 + i * 1.7)) * 0.08 * UNIT
    } else if (sp > 2) {
      rot = Math.sin(t * Math.PI * 2) * 0.05
      up = Math.abs(Math.sin(t * Math.PI * 2)) * Math.min(0.22, sp * 0.025) * UNIT
    } else if (sp > 0.1) {
      rot = Math.sin(t * Math.PI * 2) * 0.025
      up = Math.abs(Math.sin(t * Math.PI * 2)) * 0.035 * UNIT
    } else if (h.phase === 'calm' && h.fear >= UNEASY) {
      // 不安了：抬起头来张望，不吃也不喝
      rot = -(0.05 + 0.03 * Math.sin(now / 400 + i * 2)) * b.face
    } else {
      const low = b.drink ? 0.11 : 0.05 * (0.5 + 0.5 * Math.sin(t * 0.7 + i))
      rot = low * b.face + Math.sin(t * 1.3) * 0.01
    }
    Transform.x[eid] = b.x
    Transform.y[eid] = b.y + b.r * FOOT - (size * ART) / 2
    Transform.w[eid] = size
    Transform.h[eid] = size
    Transform.rot[eid] = rot
    VisOff.x[eid] = 0
    VisOff.y[eid] = -up
    Sprite.flipX[eid] = b.face > 0 ? 1 : 0
    Depth.z[eid] = enemyZ((b.y + b.r * FOOT - ly) / UNIT)
    const flash = now - b.flinch < FLINCH_MS
    Tint.effect[eid] = flash ? 1 : 0
    Tint.color[eid] = 0xffffff
  })
}

/**
 * 水坑：能走的是深草丛、刺灌丛与山丘围着的一片草地，水坑的水、蚁丘、枯树与金合欢的树干挡路；草丛与山丘挡子弹与视线，蚁丘与树干按高矮挡。
 * 水坑边的兽群不属于任何一方：不打谁，不被瞄、打不死；它们挡身体、挡子弹也挡视线，挤着谁就把谁推开，敌人追过来会从旁边绕。
 * 兽群会受惊：附近炸响、挨了打、被一大群身体挤着，惊慌就往上涨，没人惊扰会慢慢落回去；涨满了先预警，再整群背着惊扰狂奔，
 * 踩到谁就撞飞谁、敌我通吃，跑出一段慢下来，再回到水边。头目登场时兽群立刻受惊
 */
export const savanna: WorldHooks = {
  ...bounded,
  constrainBody(sim, eid, _from, next) {
    const s = savannaOf(sim)
    const r = Radius.v[eid]!
    const low = hasComponent(sim.world, eid, Span) ? loOf(sim.world, eid) * LAYER_M : 0
    const p = hasComponent(sim.world, eid, Phasing) || inTransit(eid) ? next : outOfHerd(s.herd, next.x, next.y, r, (b) => low >= b.h)
    return keepOut(s.plan.basin, p.x, p.y, r)
  },
  basin(sim) {
    return savannaOf(sim).plan.basin
  },
  ground(sim) {
    return savannaOf(sim).plan.basin
  },
  chaseDir(sim, eid, tx, ty) {
    const s = savannaOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const r = Radius.v[eid]!
    const d = hasComponent(sim.world, eid, Phasing) ? norm(tx - x, ty - y) : aroundHerd(s.herd, x, y, norm(tx - x, ty - y), r)
    return alongWall(s.plan.basin, x, y, d.x, d.y, r + 0.3 * UNIT)
  },
  trace(sim, probe, ax, ay, bx, by) {
    const s = savannaOf(sim)
    const solid = solidsTrace(s.solids, probe, ax, ay, bx, by)
    const beast = herdTrace(s.herd, probe, ax, ay, bx, by)
    return beast && (!solid || beast.t0 < solid.t0) ? beast : solid
  },
  solidAt(sim, x, y) {
    const s = savannaOf(sim)
    for (const b of s.herd.beasts) if (Math.hypot(x - b.x, y - b.y) < b.r * HIT_SHRINK) return { topM: b.h, material: 'beast' }
    return solidOf(s.solids, x, y)
  },
  /** 子弹或出手撞上了一头：它一哆嗦，兽群受一下惊 */
  impact(sim, x, y, material) {
    if (material !== 'beast') return
    const s = savannaOf(sim)
    let near: Beast | null = null
    let best = HIT_REACH_U * UNIT
    for (const b of s.herd.beasts) {
      const d = Math.hypot(x - b.x, y - b.y) - b.r
      if (d < best) {
        best = d
        near = b
      }
    }
    if (!near) return
    near.flinch = s.clock
    scare(s.herd, cfgOf(sim), x, y, cfgOf(sim).fear.hit, s.clock)
  },
  /** 离哪一头 blastU 格以内炸响，按离最近那头多近让惊慌涨，炸得越开离得越近 */
  blast(sim, x, y, r) {
    const s = savannaOf(sim)
    const f = cfgOf(sim).fear
    const gap = Math.max(0, herdGap(s.herd, x, y) - r)
    const reach = f.blastU * UNIT
    if (gap >= reach) return
    scare(s.herd, cfgOf(sim), x, y, f.blast * (1 - gap / reach), s.clock)
  },
  wanderDir(sim, eid, dx, dy) {
    const s = savannaOf(sim)
    const b = s.plan.basin
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const r = Radius.v[eid]!
    const d = offHerd(s.herd, x, y, { x: dx, y: dy }, r)
    if (roomAt(b, x, y) > r + 0.6 * UNIT) return d
    const n = awayFromWall(b, x, y)
    const dot = d.x * n.x + d.y * n.y
    return dot >= 0 ? d : { x: d.x - 2 * dot * n.x, y: d.y - 2 * dot * n.y }
  },
  fleeDir(sim, eid, awayX, awayY) {
    const s = savannaOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const r = Radius.v[eid]!
    const f = fleeSteer(x, y, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
    const d = offHerd(s.herd, x, y, f, r)
    return alongWall(s.plan.basin, x, y, d.x, d.y, r + 1.5 * UNIT)
  },
  /** 刷怪点落在草地上、离边与障碍至少一格，不压着兽群；头目离队长更远 */
  spawnPoint(sim, boss) {
    const s = savannaOf(sim)
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    let p: Point = { x: s.plan.start.x * UNIT, y: s.plan.start.y * UNIT }
    for (let i = 0; i < 48; i++) {
      p = { x: sim.rng.next() * sim.mapW, y: sim.rng.next() * sim.mapH }
      if (roomAt(s.plan.basin, p.x, p.y) < UNIT || herdGap(s.herd, p.x, p.y) < UNIT) continue
      if ((p.x - lead.x) ** 2 + (p.y - lead.y) ** 2 >= far * far) return p
    }
    return openNear(s, p, UNIT)
  },
  center(sim) {
    const st = savannaOf(sim).plan.start
    return { x: st.x * UNIT, y: st.y * UNIT }
  },
  settle(sim, p) {
    return openNear(savannaOf(sim), p, SPAWN.edgeInset * UNIT)
  },
  canSpawn(sim, x, y, radius) {
    const s = savannaOf(sim)
    return roomFor(s.plan.basin, x, y, radius) && herdGap(s.herd, x, y) >= radius + 0.2 * UNIT
  },
  landmarks(sim) {
    return savannaOf(sim).plan.marks
  },
  onStart(sim) {
    savannaOf(sim)
  },
  /** 兽群按水坑自己的钟走：时停时一起停；挤着的身体让它们受惊，头目登场让它们立刻受惊，狂奔时踩人 */
  tick(sim, delta) {
    const cfg = cfgOf(sim)
    const s = savannaOf(sim)
    const dt = Math.min(delta, 100) / 1000
    s.clock += delta
    watchBosses(sim, s, cfg)
    crowding(sim, s, cfg, dt)
    stepHerd(s.herd, cfg, s.plan, sim.rng, s.clock, dt)
    trample(sim, s, cfg)
    pose(sim, s, cfg)
  },
}
