import { query } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { Alive, ENEMY_SET, Motion, MOTION, Radius, Transform } from '../components'
import { hit } from '../systems/shared/damage'
import { fleeSteer } from '../systems/shared/steer'
import { hazardSource } from '../utils/source'
import { HIT } from '../utils/hitTags'
import { leaderPoint } from '../utils/team'
import { awayFromWall, keepOut, roomAt } from '../worlds/basin'
import { circuitPlan, copperAt, segDist } from './layout'
import type { CircuitPlan } from './layout'
import type { Basin } from '../worlds/basin'
import type { CircuitConfig, MapId } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../sim'
import type { Surface, WorldHooks } from '../worlds/hooks'

const ZERO: Point = { x: 0, y: 0 }
const NO_GHOSTS: Point[] = []
/** 电路板按布景种子打散出自己的种子 */
const PLAN_SEED = 0x3c1d7e
/** 画面一次最多记这么多处冒火花的地方 */
const ZAP_CAP = 32
const SHOCK_TINT = 0x5ff4ff
const ARC_TINT = 0xb9a8ff
/** 挪坑位时按这么大的身体（格）、再多留这么远（格）算；电极蓄电蓄过这么多就让开 */
const SEAT_BODY_U = 0.45
const SEAT_MARGIN_U = 0.2
const SEAT_ARC_FROM = 0.4

/** 一条网络此刻：通没通电（0 或 1）、电从电源沿铜冲到了多远（格）、离通电还有多近（0 到 1，只有时钟线有） */
export interface NetState {
  level: number
  front: number
  warn: number
}

export type GapPhase = 'rest' | 'charge' | 'arc'

/** 一处电弧此刻：在歇、蓄电还是放电，蓄了多少，放过几次电；这一次放电已经打中了谁 */
export interface GapState {
  phase: GapPhase
  charge: number
  count: number
  readonly struck: Set<number>
}

export type ButtonPhase = 'ready' | 'travel' | 'live' | 'rearm'

/** 开关此刻：等人踩、电在沿线走、铜板通着、断开后歇着；从什么时候起，被踩过几次 */
export interface ButtonState {
  phase: ButtonPhase
  since: number
  presses: number
}

/** 电路板此刻：按种子生成的板子，每条网络、每处电弧、每个开关的状态；上一次结算触电时挨电的身体在哪（格） */
export interface CircuitState {
  readonly plan: CircuitPlan
  readonly nets: NetState[]
  readonly gaps: GapState[]
  readonly buttons: ButtonState[]
  hurtAt: number
  readonly zaps: Point[]
  zapCount: number
}

function cfgOf(sim: Sim): CircuitConfig {
  return MAPS[sim.mapId].circuit!
}

/** 这一局的电路板：视图要它定地图的大小，规则要它定边界与带电的铜，两边按同一个种子各要一次 */
export function circuitPlanFor(cfg: CircuitConfig, decorSeed: number): CircuitPlan {
  return circuitPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

export function circuitOf(sim: Sim): CircuitState {
  let s = sim.worldState.circuit
  if (!s) {
    const plan = circuitPlanFor(cfgOf(sim), sim.run.decorSeed)
    s = {
      plan,
      nets: plan.nets.map(() => ({ level: 0, front: 0, warn: 0 })),
      gaps: plan.gaps.map(() => ({ phase: 'rest' as GapPhase, charge: 0, count: 0, struck: new Set<number>() })),
      buttons: plan.buttons.map(() => ({ phase: 'ready' as ButtonPhase, since: 0, presses: 0 })),
      hurtAt: cfgOf(sim).shock.tickMs,
      zaps: [],
      zapCount: 0,
    }
    sim.worldState.circuit = s
  }
  return s
}

/** 时钟的节拍：断、预警、通，各占多久由地图定，每个时钟错开 phaseMs */
export function clockPhase(cfg: CircuitConfig, now: number, phaseMs: number): { level: number; warn: number; onFor: number } {
  const c = cfg.clock
  const t = (now + phaseMs) % (c.offMs + c.warnMs + c.onMs)
  if (t < c.offMs) return { level: 0, warn: 0, onFor: 0 }
  if (t < c.offMs + c.warnMs) return { level: 0, warn: (t - c.offMs) / c.warnMs, onFor: 0 }
  return { level: 1, warn: 0, onFor: t - c.offMs - c.warnMs }
}

/** 电弧的节拍：歇、蓄电、放电，每处错开 phaseMs */
export function gapPhase(cfg: CircuitConfig, now: number, phaseMs: number): { phase: GapPhase; charge: number; cycle: number } {
  const a = cfg.arc
  const period = a.restMs + a.chargeMs + a.arcMs
  const t = now + phaseMs
  const cycle = Math.floor(t / period)
  const k = t - cycle * period
  if (k < a.restMs) return { phase: 'rest', charge: 0, cycle }
  if (k < a.restMs + a.chargeMs) return { phase: 'charge', charge: (k - a.restMs) / a.chargeMs, cycle }
  return { phase: 'arc', charge: 1, cycle }
}

/** 脚沾着板面的身体：腾空的、穿行中的不算 */
function grounded(eid: number): boolean {
  return Alive.v[eid] !== 0 && Motion.kind[eid] !== MOTION.transit && Motion.kind[eid] !== MOTION.arc
}

/** 队伍与敌人里脚沾着板面的身体 */
function bodies(sim: Sim): number[] {
  const out: number[] = []
  for (const m of sim.characters) if (grounded(m)) out.push(m)
  for (const e of query(sim.world, ENEMY_SET)) if (grounded(e)) out.push(e)
  return out
}

/** 这具身体的脚碰没碰到通着电的铜 */
function shocked(s: CircuitState, cfg: CircuitConfig, eid: number): boolean {
  const c = copperAt(s.plan.copper, Transform.x[eid]! / UNIT, Transform.y[eid]! / UNIT)
  if (!c || c.dist > (Radius.v[eid]! / UNIT) * cfg.shock.footFrac) return false
  const n = s.nets[c.net]!
  return n.level > 0 && c.along <= n.front
}

/** 按此刻的时间更新每条网络、每个开关、每处电弧 */
function step(sim: Sim, s: CircuitState, cfg: CircuitConfig, live: readonly number[]): void {
  const now = sim.elapsedMs
  const plan = s.plan
  plan.nets.forEach((net, i) => {
    const st = s.nets[i]!
    if (net.kind === 'rail') {
      st.level = 1
      st.front = Infinity
    }
  })
  for (const c of plan.clocks) {
    const p = clockPhase(cfg, now, c.phaseMs)
    for (const i of c.nets) {
      const st = s.nets[i]!
      st.level = p.level
      st.warn = p.warn
      st.front = (p.onFor / 1000) * cfg.clock.surgeU
    }
  }
  const bc = cfg.button
  plan.buttons.forEach((b, i) => {
    const st = s.buttons[i]!
    const ns = s.nets[b.net]!
    const len = plan.nets[b.net]!.length
    if (st.phase === 'ready') {
      const r = b.r * UNIT
      if (live.some((eid) => (Transform.x[eid]! - b.x * UNIT) ** 2 + (Transform.y[eid]! - b.y * UNIT) ** 2 <= r * r)) {
        st.phase = 'travel'
        st.since = now
        st.presses++
      }
    } else if (st.phase === 'travel' && ((now - st.since) / 1000) * bc.linkU >= len) {
      st.phase = 'live'
      st.since = now
    } else if (st.phase === 'live' && now - st.since >= bc.holdMs) {
      st.phase = 'rearm'
      st.since = now
    } else if (st.phase === 'rearm' && now - st.since >= bc.rearmMs) {
      st.phase = 'ready'
      st.since = now
    }
    ns.level = st.phase === 'travel' || st.phase === 'live' ? 1 : 0
    ns.front = st.phase === 'live' ? Infinity : st.phase === 'travel' ? ((now - st.since) / 1000) * bc.linkU : 0
  })
  plan.gaps.forEach((g, i) => {
    const st = s.gaps[i]!
    const p = gapPhase(cfg, now, g.phaseMs)
    if (p.phase === 'arc' && st.phase !== 'arc') {
      st.count++
      st.struck.clear()
    }
    st.phase = p.phase
    st.charge = p.charge
  })
}

/** 放电时离电弧够近的身体挨一下，每次放电每具身体只挨一下 */
function strike(sim: Sim, s: CircuitState, cfg: CircuitConfig, live: readonly number[]): void {
  const src = hazardSource('arc', ARC_TINT)
  const a = cfg.arc
  s.plan.gaps.forEach((g, i) => {
    const st = s.gaps[i]!
    if (st.phase !== 'arc') return
    for (const eid of live) {
      if (st.struck.has(eid)) continue
      const d = segDist(g.a.x, g.a.y, g.b.x, g.b.y, Transform.x[eid]! / UNIT, Transform.y[eid]! / UNIT)
      if (d > a.reachU + Radius.v[eid]! / UNIT) continue
      st.struck.add(eid)
      const team = sim.characters.includes(eid)
      hit(sim, src, eid, team ? a.teamDamage : a.enemyDamage, { tags: HIT.area })
    }
  })
}

/** 每隔 tickMs 结算一次触电：脚碰着通电的铜就按每秒伤害折算挨一下；挨电的地方记给画面冒火花 */
function shock(sim: Sim, s: CircuitState, cfg: CircuitConfig, live: readonly number[]): void {
  const now = sim.elapsedMs
  if (now < s.hurtAt) return
  s.hurtAt = now + cfg.shock.tickMs
  const frac = cfg.shock.tickMs / 1000
  const src = hazardSource('shock', SHOCK_TINT)
  const team = Math.max(1, Math.round(cfg.shock.teamDps * frac))
  const enemy = Math.max(1, Math.round(cfg.shock.enemyDps * frac))
  s.zaps.length = 0
  for (const eid of live) {
    if (!shocked(s, cfg, eid)) continue
    if (s.zaps.length < ZAP_CAP) s.zaps.push({ x: Transform.x[eid]! / UNIT, y: Transform.y[eid]! / UNIT })
    hit(sim, src, eid, sim.characters.includes(eid) ? team : enemy, { tick: true })
  }
  s.zapCount++
}

const GROUNDS = new Map<MapId, Surface>()

/** 板面：费力与回复来自地图，其余同平地 */
function groundOf(sim: Sim): Surface {
  let g = GROUNDS.get(sim.mapId)
  if (!g) {
    const { exertion, regen } = MAPS[sim.mapId].stamina
    g = { traction: 1, viscosity: 1, exertion, regen }
    GROUNDS.set(sim.mapId, g)
  }
  return g
}

/** 离边 reach 像素以内几乎正对着边走时改为顺着边走，免得顶在罩壁或芯片上不动；斜着撞上的由碰撞自己滑开 */
function alongWall(b: Basin, x: number, y: number, dx: number, dy: number, reach: number): Point {
  if (roomAt(b, x, y) > reach) return { x: dx, y: dy }
  const n = awayFromWall(b, x, y)
  if (dx * n.x + dy * n.y > -0.9) return { x: dx, y: dy }
  const side = dy * n.x - dx * n.y >= 0 ? 1 : -1
  return { x: -n.y * side, y: n.x * side }
}

/** 板面上离边至少 room 像素、不压着带电的铜的一点：从 p 往外一圈圈找，近处找不到就退回开局站位 */
function openNear(plan: CircuitPlan, p: Point, room: number): Point {
  for (let r = 0; r <= 8 * UNIT; r += 0.5 * UNIT) {
    const n = r === 0 ? 1 : Math.ceil((r * Math.PI * 2) / (0.5 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      if (roomAt(plan.basin, q.x, q.y) >= room && clearOfCopper(plan, q)) return q
    }
  }
  return { x: plan.start.x * UNIT, y: plan.start.y * UNIT }
}

/** 队员站在这里会不会挨电：脚下的铜通着电、快通电，或旁边的电极在蓄电、放电 */
function risky(s: CircuitState, cfg: CircuitConfig, x: number, y: number): boolean {
  const foot = (SEAT_BODY_U * cfg.shock.footFrac) + SEAT_MARGIN_U
  const c = copperAt(s.plan.copper, x / UNIT, y / UNIT)
  if (c && c.dist < foot) {
    const n = s.nets[c.net]!
    if (n.level > 0 || n.warn > 0) return true
  }
  return s.plan.gaps.some((g, i) => {
    const st = s.gaps[i]!
    if (st.phase === 'rest' || (st.phase === 'charge' && st.charge < SEAT_ARC_FROM)) return false
    return segDist(g.a.x, g.a.y, g.b.x, g.b.y, x / UNIT, y / UNIT) < cfg.arc.reachU + SEAT_BODY_U + SEAT_MARGIN_U
  })
}

/** 离带电的铜至少一格 */
function clearOfCopper(plan: CircuitPlan, p: Point): boolean {
  const c = copperAt(plan.copper, p.x / UNIT, p.y / UNIT)
  return !c || c.dist > 1
}

/**
 * 电路板：能走的是屏蔽罩围着的板面，罩壁、芯片和别的元件是硬边界，身体走到跟前就停住、顺着边滑，子弹照样飞过去。
 * 镀金的裸铜线带电：电源线一直通，时钟线按节拍通断，开关线有人踩了开关才从开关沿线一路通过去；脚碰着通电的铜就触电，
 * 一对电极隔一阵在两尖之间打出电弧，都是敌我通吃
 */
export const circuit: WorldHooks = {
  torus: false,
  worldDelta(_sim, fromX, fromY, toX, toY) {
    return { x: toX - fromX, y: toY - fromY }
  },
  ghosts() {
    return NO_GHOSTS
  },
  wrap(_sim, x, y) {
    return { x, y }
  },
  projectileLifeMs() {
    return 0
  },
  mediumVelocity() {
    return ZERO
  },
  pull() {
    return ZERO
  },
  sink() {
    return false
  },
  surface(sim) {
    return groundOf(sim)
  },
  effort() {
    return 1
  },
  contact() {
    return false
  },
  constrainBody(sim, eid, _from, next) {
    return keepOut(circuitOf(sim).plan.basin, next.x, next.y, Radius.v[eid]!)
  },
  basin(sim) {
    return circuitOf(sim).plan.basin
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = norm(tx - x, ty - y)
    return alongWall(circuitOf(sim).plan.basin, x, y, d.x, d.y, Radius.v[eid]! + 0.3 * UNIT)
  },
  wallHit() {
    return null
  },
  smashWall() {},
  wanderDir(sim, eid, dx, dy) {
    const b = circuitOf(sim).plan.basin
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (roomAt(b, x, y) > Radius.v[eid]! + 0.6 * UNIT) return { x: dx, y: dy }
    const n = awayFromWall(b, x, y)
    const dot = dx * n.x + dy * n.y
    return dot >= 0 ? { x: dx, y: dy } : { x: dx - 2 * dot * n.x, y: dy - 2 * dot * n.y }
  },
  fleeDir(sim, eid, awayX, awayY) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = fleeSteer(x, y, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
    return alongWall(circuitOf(sim).plan.basin, x, y, d.x, d.y, Radius.v[eid]! + 1.5 * UNIT)
  },
  outside(sim, x, y) {
    return x < -UNIT || x > sim.mapW + UNIT || y < -UNIT || y > sim.mapH + UNIT
  },
  /** 刷怪点落在板面上、离边至少一格、离带电的铜至少一格；头目离队长更远 */
  spawnPoint(sim, boss) {
    const plan = circuitOf(sim).plan
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    let p: Point = { x: plan.start.x * UNIT, y: plan.start.y * UNIT }
    for (let i = 0; i < 48; i++) {
      p = { x: sim.rng.next() * sim.mapW, y: sim.rng.next() * sim.mapH }
      if (roomAt(plan.basin, p.x, p.y) < UNIT || !clearOfCopper(plan, p)) continue
      if ((p.x - lead.x) ** 2 + (p.y - lead.y) ** 2 >= far * far) return p
    }
    return openNear(plan, p, UNIT)
  },
  center(sim) {
    const st = circuitOf(sim).plan.start
    return { x: st.x * UNIT, y: st.y * UNIT }
  },
  settle(sim, p) {
    return openNear(circuitOf(sim).plan, p, SPAWN.edgeInset * UNIT)
  },
  /** 坑位挨电时顺着往队长那边挪，挪到不挨电为止；一路都挨电（队长自己站在电上）就不挪 */
  seat(sim, from, at) {
    const cfg = cfgOf(sim)
    const s = circuitOf(sim)
    if (!risky(s, cfg, at.x, at.y)) return at
    const dx = from.x - at.x
    const dy = from.y - at.y
    const n = Math.ceil(Math.hypot(dx, dy) / (0.25 * UNIT))
    for (let k = 1; k <= n; k++) {
      const p = { x: at.x + (dx * k) / n, y: at.y + (dy * k) / n }
      if (!risky(s, cfg, p.x, p.y)) return p
    }
    return at
  },
  onStart(sim) {
    circuitOf(sim)
  },
  tick(sim) {
    const cfg = cfgOf(sim)
    const s = circuitOf(sim)
    const live = bodies(sim)
    step(sim, s, cfg, live)
    strike(sim, s, cfg, live)
    shock(sim, s, cfg, live)
  },
}
