import { hasComponent, query, removeEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { OBSTACLES } from '../../data/obstacles'
import { Alive, Drive, Faction, Grow, Hp, LevelUp, Motion, MOTION, Phys, Pickup, Radius, Slot, Span, Stats, Transform, Uid } from '../../ecs/components'
import { bodyDt } from '../../ecs/systems/shared/body'
import { hit } from '../../ecs/systems/shared/damage'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { staminaLeft } from '../../ecs/systems/shared/stamina'
import { inTransit } from '../../ecs/utils/marks'
import { hazardSource } from '../../ecs/utils/source'
import { leaderPoint } from '../../ecs/utils/team'
import { bounded, groundOf } from '../../ecs/worlds/hooks'
import { makeSolids, solidOf, solidsTrace } from '../../ecs/worlds/solids'
import { alongWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { firmAt, inTrunk, swampPlan } from './layout'
import type { SwampPlan } from './layout'
import type { SwampConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { Solid, Solids } from '../../ecs/worlds/solids'
import type { Surface, WorldHooks } from '../../ecs/worlds/hooks'

/** 泥潭按布景种子打散出自己的种子 */
const PLAN_SEED = 0x5a3f1d
const MIRE_TINT = 0x6d4c33
const WOOD: Solid = { topM: Infinity, material: 'wood' }
/** 队长站在实地上时，落在泥里的坑位往附近的实地挪，最远挪这么远（格）；挪到离实地边至少这么远（格）的地方 */
const SEAT_REACH_U = 3
const SEAT_INSET_U = 0.25
/** 被拖着走的掉落物（被吸过去的）每秒往上冒多少 */
const LOOT_RISE = 2
/** 记的事最多留这么多件，等画面取走 */
const EVENT_KEEP = 32

/** 一个身体陷在泥里的样子：uid 认人；d 是深度（0 到 1），trapped 是被困住了；hx、hy 是一直朝哪使劲（按时间常数记着），effort 是此刻挣的劲（0 到 1） */
export interface Mire {
  uid: number
  d: number
  trapped: boolean
  hx: number
  hy: number
  effort: number
}

/** 泥潭里的一件事，给画面放声音、冒泥浆：陷住了、拔出来了、一枚掉落物沉没了 */
export interface MireEvent {
  readonly kind: 'trap' | 'free' | 'gulp'
  readonly x: number
  readonly y: number
  readonly r: number
}

/** 泥潭此刻：按种子定下的地形与挡子弹的树干；每个身体与掉落物陷了多深；下一次结算呛泥在几时；还没被画面取走的事 */
export interface SwampState {
  readonly plan: SwampPlan
  readonly solids: Solids
  readonly mire: Map<number, Mire>
  readonly loot: Map<number, { uid: number; d: number }>
  chokeAt: number
  readonly events: MireEvent[]
}

function cfgOf(sim: Sim): SwampConfig {
  return MAPS[sim.mapId].swamp!
}

/** 这一局的泥潭：视图要它画地，规则要它定边界，两边按同一个种子各要一次 */
export function swampPlanFor(cfg: SwampConfig, decorSeed: number): SwampPlan {
  return swampPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

export function swampOf(sim: Sim): SwampState {
  let s = sim.worldState.swamp
  if (!s) {
    const plan = swampPlanFor(cfgOf(sim), sim.run.decorSeed)
    const b = plan.basin
    s = {
      plan,
      solids: makeSolids((x, y) => (inTrunk(plan, x / UNIT, y / UNIT) > 0 ? WOOD : null), b.x0, b.y0, b.cols, b.rows, b.cell),
      mire: new Map(),
      loot: new Map(),
      chokeAt: 0,
      events: [],
    }
    sim.worldState.swamp = s
  }
  return s
}

/** (x, y) 像素处是泥：在能走的地面上、又不在实地上 */
export function inMud(plan: SwampPlan, x: number, y: number): boolean {
  return firmAt(plan, x, y) <= 0 && roomAt(plan.basin, x, y) > 0
}

/** 这个身体陷得怎样：认得出就是它的那份，没陷过是 null */
export function mireOf(s: SwampState, eid: number): Mire | null {
  const m = s.mire.get(eid)
  return m && m.uid === Uid.v[eid] ? m : null
}

/** 这枚掉落物沉下去多少（0 到 1） */
export function lootSunk(s: SwampState, eid: number): number {
  const l = s.loot.get(eid)
  return l && l.uid === Uid.v[eid] ? l.d : 0
}

/** 身子有多重，按标准身体算：质量乘体型的平方（标准半径为 1），夹在配置的范围里 */
export function weightOf(cfg: SwampConfig, eid: number): number {
  const size = Grow.r0[eid]! / (OBSTACLES.body.refRadiusU * UNIT)
  return Math.min(cfg.sink.weight[1], Math.max(cfg.sink.weight[0], Phys.mass[eid]! * size * size))
}

/** 个子大得蹚泥如走平地 */
export function wades(cfg: SwampConfig, eid: number): boolean {
  return Radius.v[eid]! >= cfg.sink.wadeU * UNIT
}

/** 陷到 d 时泥有多黏：刚沾泥到陷到困住之间按深度插，被困住时最黏 */
export function mudViscosity(cfg: SwampConfig, d: number, trapped: boolean): number {
  if (trapped) return cfg.drag.stuck
  const [v0, v1] = cfg.drag.viscosity
  return v0 + (v1 - v0) * Math.min(1, d / cfg.sink.trap)
}

function track(s: SwampState, eid: number): Mire {
  let m = s.mire.get(eid)
  if (!m || m.uid !== Uid.v[eid]) {
    m = { uid: Uid.v[eid]!, d: 0, trapped: false, hx: 0, hy: 0, effort: 0 }
    s.mire.set(eid, m)
  }
  return m
}

function note(s: SwampState, e: MireEvent): void {
  s.events.push(e)
  if (s.events.length > EVENT_KEEP) s.events.splice(0, s.events.length - EVENT_KEEP)
}

/**
 * 一个身体这一步陷多深：悬空、穿行的不沾泥；蹚泥的与站在实地上的往外拔；自己腾跃、冲刺时借着劲往外拔；
 * 在泥里按动得快慢往下陷，越重陷得越快；被困住时朝一个方向一直使劲往外拔、使着劲时也不再往下陷，越重拔得越慢，队员体力见底劲就小了
 */
function sinkBody(sim: Sim, s: SwampState, cfg: SwampConfig, eid: number, dt: number): void {
  const k = cfg.sink
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  const kind = Motion.kind[eid]
  if (Span.lo[eid]! > 0 || inTransit(eid) || kind === MOTION.transit || kind === MOTION.follow) return
  const m = s.mire.get(eid)?.uid === Uid.v[eid] ? s.mire.get(eid)! : null
  const mud = inMud(s.plan, x, y) && !wades(cfg, eid)
  if (!mud || kind === MOTION.arc || kind === MOTION.dash) {
    if (!m) return
    const rate = mud ? 1.5 / cfg.heave.pullS : 1 / k.recoverS
    m.d = Math.max(0, m.d - rate * dt)
    m.effort = 0
    if (m.trapped && (!mud || m.d < k.free)) free(sim, s, m, eid)
    if (m.d <= 0 && !m.trapped) s.mire.delete(eid)
    return
  }
  const st = track(s, eid)
  const w = weightOf(cfg, eid)
  // 朝哪使劲：单位方向乘使了几成劲，按时间常数记着；方向来回换就互相抵掉
  const dx = Drive.x[eid]!
  const dy = Drive.y[eid]!
  const want = Math.hypot(dx, dy)
  const full = Math.max(1e-6, Stats.moveSpeed[eid]! * UNIT * 0.6)
  const push = Math.min(1, want / full)
  // 自己在走才算走：被挤、被推着动的不算
  const moving = push * Math.min(1, Math.hypot(Phys.vx[eid]!, Phys.vy[eid]!) / (k.walkU * UNIT))
  const sink = (w * (1 - moving * (1 - k.walkMul))) / k.sinkS
  const a = 1 - Math.exp(-dt / cfg.heave.tauS)
  st.hx += ((want > 0 ? (dx / want) * push : 0) - st.hx) * a
  st.hy += ((want > 0 ? (dy / want) * push : 0) - st.hy) * a
  if (!st.trapped) {
    st.effort = 0
    st.d = Math.min(1, st.d + sink * dt)
    if (st.d >= k.trap) {
      st.trapped = true
      note(s, { kind: 'trap', x, y, r: Radius.v[eid]! })
      sim.out.bursts.push({ x, y, count: 5, kind: 'mud' })
    }
    return
  }
  const tired = hasComponent(sim.world, eid, Slot) && staminaLeft(eid) <= 0 ? cfg.heave.tired : 1
  st.effort = Math.min(1, Math.hypot(st.hx, st.hy)) * tired
  const pull = ((1 - k.free) / (cfg.heave.pullS * Math.sqrt(w))) * st.effort
  st.d = Math.max(0, Math.min(1, st.d + (sink * (1 - st.effort) - pull) * dt))
  if (st.d < k.free) free(sim, s, st, eid)
}

/** 拔出来了：甩起一团泥浆 */
function free(sim: Sim, s: SwampState, m: Mire, eid: number): void {
  m.trapped = false
  m.effort = 0
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  note(s, { kind: 'free', x, y, r: Radius.v[eid]! })
  sim.out.bursts.push({ x, y, count: 7, kind: 'mud' })
}

/** 陷到最深的呛泥掉血：满血的标准身体 chokeSec 秒呛死，每 tickMs 结算一次；敌我一样 */
function choke(sim: Sim, s: SwampState, cfg: SwampConfig): void {
  const now = sim.elapsedMs
  if (now < s.chokeAt) return
  const k = cfg.sink
  s.chokeAt = now + k.tickMs
  const src = hazardSource('mire', MIRE_TINT)
  for (const [eid, m] of [...s.mire]) {
    if (m.uid !== Uid.v[eid] || !hasComponent(sim.world, eid, Alive) || !Alive.v[eid]) continue
    if (m.d < k.choke || inTransit(eid) || Span.lo[eid]! > 0) continue
    hit(sim, src, eid, Math.max(1, Math.round((Hp.max[eid]! * k.tickMs) / 1000 / k.chokeSec)), { tick: true })
  }
}

/** 掉在泥里的掉落物慢慢沉下去，沉没了就没了；被吸着走的往上冒；升级道具浮着不沉 */
function sinkLoot(sim: Sim, s: SwampState, cfg: SwampConfig, dt: number): void {
  for (const eid of [...query(sim.world, [Pickup, Transform])]) {
    if (hasComponent(sim.world, eid, LevelUp)) continue
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    let l = s.loot.get(eid)
    if (l && l.uid !== Uid.v[eid]) l = undefined
    const pulled = Drive.x[eid] !== 0 || Drive.y[eid] !== 0
    if (!inMud(s.plan, x, y) || pulled) {
      if (l) l.d = Math.max(0, l.d - LOOT_RISE * dt)
      if (l && l.d <= 0) s.loot.delete(eid)
      continue
    }
    if (!l) {
      l = { uid: Uid.v[eid]!, d: 0 }
      s.loot.set(eid, l)
    }
    l.d += dt / cfg.loot.sinkS
    if (l.d < 1) continue
    note(s, { kind: 'gulp', x, y, r: Radius.v[eid]! })
    s.loot.delete(eid)
    removeEntity(sim.world, eid)
  }
}

/** 记着的身体与掉落物里，已经不在的（eid 换了人）清掉 */
function sweep(s: SwampState): void {
  for (const [eid, m] of s.mire) if (m.uid !== Uid.v[eid]) s.mire.delete(eid)
  for (const [eid, l] of s.loot) if (l.uid !== Uid.v[eid]) s.loot.delete(eid)
}

/** 能走的地面上离边至少 room 像素的一点：从 p 往外一圈圈找，近处找不到就退回开局站位 */
function openNear(plan: SwampPlan, p: Point, room: number): Point {
  for (let r = 0; r <= 8 * UNIT; r += 0.5 * UNIT) {
    const n = r === 0 ? 1 : Math.ceil((r * Math.PI * 2) / (0.5 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      if (roomAt(plan.basin, q.x, q.y) >= room) return q
    }
  }
  return { x: plan.start.x * UNIT, y: plan.start.y * UNIT }
}

/** at 附近 reach 像素以内离它最近的一块实地（离实地边至少 inset 格、站得下标准身体）；找不到就是 null */
function firmNear(plan: SwampPlan, at: Point, reach: number, inset: number): Point | null {
  const room = OBSTACLES.body.refRadiusU * UNIT
  for (let r = 0.3 * UNIT; r <= reach; r += 0.3 * UNIT) {
    const n = Math.ceil((r * Math.PI * 2) / (0.35 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const q = { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r }
      if (firmAt(plan, q.x, q.y) >= inset && roomAt(plan.basin, q.x, q.y) >= room) return q
    }
  }
  return null
}

/**
 * 泥潭：能走的是岸线以内、水洼与落羽杉树干以外的地面，加上伸进水里的栈桥；水面谁也过不去，子弹与视线从水面上过去，树干挡子弹也挡视线。
 * 地面分实地与泥：踩进泥里就往下陷，陷得越深越黏脚、越不容易被击退，陷过一截被困住，朝一个方向一直使劲才拔得出来（队员费体力），陷到最深呛泥掉血；
 * 实地上慢慢拔干净。敌我一样，个子特别大的蹚泥如走平地，悬空的不沾泥。泥里的掉落物慢慢沉没
 */
export const swamp: WorldHooks = {
  ...bounded,
  surface(sim, x, y, body) {
    const g = groundOf(sim)
    if (body === undefined || !hasComponent(sim.world, body, Faction)) return g
    const cfg = cfgOf(sim)
    const s = swampOf(sim)
    if (wades(cfg, body)) return g
    const m = mireOf(s, body)
    if (!inMud(s.plan, x, y)) return m ? { ...g, viscosity: 1 + cfg.drag.caked * m.d } : g
    const mud: Surface = { traction: 1, viscosity: mudViscosity(cfg, m?.d ?? 0, m?.trapped ?? false), exertion: g.exertion + cfg.drag.exertion, regen: g.regen }
    return mud
  },
  /** 被困住时使着劲往外拔的队员费体力 */
  breath(sim, eid) {
    if (!hasComponent(sim.world, eid, Slot)) return 0
    const m = mireOf(swampOf(sim), eid)
    return m && m.trapped ? -cfgOf(sim).heave.stamina * m.effort : 0
  },
  /** 队长站在实地上时，落在泥里的坑位挪到附近的实地上：跟着的队员不至于站在泥里陷下去 */
  seat(sim, from, at) {
    const plan = swampOf(sim).plan
    if (inMud(plan, from.x, from.y) || !inMud(plan, at.x, at.y)) return at
    return firmNear(plan, at, SEAT_REACH_U * UNIT, SEAT_INSET_U) ?? at
  },
  constrainBody(sim, eid, _from, next) {
    return keepOut(swampOf(sim).plan.basin, next.x, next.y, Radius.v[eid]!)
  },
  basin(sim) {
    return swampOf(sim).plan.basin
  },
  ground(sim) {
    return swampOf(sim).plan.basin
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = norm(tx - x, ty - y)
    return alongWall(swampOf(sim).plan.basin, x, y, d.x, d.y, Radius.v[eid]! + 0.3 * UNIT)
  },
  trace(sim, probe, ax, ay, bx, by) {
    return solidsTrace(swampOf(sim).solids, probe, ax, ay, bx, by)
  },
  solidAt(sim, x, y) {
    return solidOf(swampOf(sim).solids, x, y)
  },
  wanderDir(sim, eid, dx, dy) {
    const b = swampOf(sim).plan.basin
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    return alongWall(b, x, y, dx, dy, Radius.v[eid]! + 0.6 * UNIT)
  },
  fleeDir(sim, eid, awayX, awayY) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = fleeSteer(x, y, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
    return alongWall(swampOf(sim).plan.basin, x, y, d.x, d.y, Radius.v[eid]! + 1.5 * UNIT)
  },
  /** 刷怪点落在能走的地面上、离水边至少一格；头目离队长更远 */
  spawnPoint(sim, boss) {
    const plan = swampOf(sim).plan
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    let p: Point = { x: plan.start.x * UNIT, y: plan.start.y * UNIT }
    for (let i = 0; i < 48; i++) {
      p = { x: sim.rng.next() * sim.mapW, y: sim.rng.next() * sim.mapH }
      if (roomAt(plan.basin, p.x, p.y) < UNIT) continue
      if ((p.x - lead.x) ** 2 + (p.y - lead.y) ** 2 >= far * far) return p
    }
    return openNear(plan, p, UNIT)
  },
  center(sim) {
    const st = swampOf(sim).plan.start
    return { x: st.x * UNIT, y: st.y * UNIT }
  },
  settle(sim, p) {
    return openNear(swampOf(sim).plan, p, SPAWN.edgeInset * UNIT)
  },
  canSpawn(sim, x, y, radius) {
    return roomFor(swampOf(sim).plan.basin, x, y, radius)
  },
  landmarks(sim) {
    return swampOf(sim).plan.marks
  },
  onStart(sim) {
    swampOf(sim)
  },
  /** 每个身体按自己的钟陷、拔；呛泥按节拍结算；泥里的掉落物往下沉 */
  tick(sim, delta) {
    const cfg = cfgOf(sim)
    const s = swampOf(sim)
    for (const eid of query(sim.world, [Faction, Phys, Transform, Radius, Alive])) {
      if (!Alive.v[eid]) continue
      const dt = bodyDt(sim, eid)
      if (dt > 0) sinkBody(sim, s, cfg, eid, dt)
    }
    choke(sim, s, cfg)
    sinkLoot(sim, s, cfg, delta / 1000)
    if (sim.elapsedMs % 2000 < delta) sweep(s)
  },
}
