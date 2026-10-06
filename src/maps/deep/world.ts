import { hasComponent } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { OBSTACLES } from '../../data/obstacles'
import { Alive, Hp, Radius, Slot, Transform } from '../../ecs/components'
import { hit } from '../../ecs/systems/shared/damage'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { staminaLeft } from '../../ecs/systems/shared/stamina'
import { inTransit } from '../../ecs/utils/marks'
import { hazardSource } from '../../ecs/utils/source'
import { leaderPoint } from '../../ecs/utils/team'
import { passCost, phases, probeZ } from '../../ecs/utils/pass'
import { bounded } from '../../ecs/worlds/hooks'
import { mapEvent } from '../../ecs/fight/events'
import { makeSolids, solidOf, solidsTrace } from '../../ecs/worlds/solids'
import { alongWall, awayFromWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { aroundHull, atDoor, breathable, doorMid, fits, fromHull, homePose, hullGap, hullOf, hullSd, innerOf, intoDoor, newSub, offHull, outOfHull, rimOf, stepSub, subTarget, toHull } from './sub'
import { deepPlan, floorDepth, inBoulder, inSkull, reachOf, toLocal } from './layout'
import type { Berth, Hull, Pose, Sub, SubPhase } from './sub'
import type { Crossing, Probe } from '../../ecs/utils/pass'
import type { DeepPlan, Local, Reach } from './layout'
import type { DeepConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { Solid, Solids } from '../../ecs/worlds/solids'
import type { WorldHooks } from '../../ecs/worlds/hooks'

/** 深海按布景种子打散出自己的种子 */
const PLAN_SEED = 0x0de9c5
const DROWN_TINT = 0x4fc3f7

/** 深海此刻的状态：按种子生成的谷底与它的实心，艇身的样子与开局停靠的地方，潜艇，上一帧潜艇在哪一段，下一次结算呛水在几时 */
export interface DeepState extends Berth {
  readonly solids: Solids
  readonly home: Pose
  readonly sub: Sub
  seen: SubPhase
  drownAt: number
}

const ROCK: Solid = { topM: Infinity, material: 'rock' }
/** 沿艇壁一圈取几个点：挑停靠的地方、落地扬泥都按它 */
const RIM_POINTS = 48
const TA = { u: 0, v: 0 }
const TB = { u: 0, v: 0 }
const L: Local = { a: 0, b: 0 }
const R: Reach = { low: 0, high: 0, rubble: 0, lip: 0 }

/** 岩壁与岩堆高过一切；大石头与头骨按它们的高；陡坎外是悬空的水，子弹和视线从上面过去 */
function solidsOf(cfg: DeepConfig, plan: DeepPlan): Solids {
  const b = plan.basin
  const at = (x: number, y: number): Solid | null => {
    if (roomAt(b, x, y) >= 0) return null
    const gx = x / UNIT
    const gy = y / UNIT
    for (const s of plan.boulders) if (inBoulder(s, gx, gy) > 0) return { topM: s.h, material: 'rock' }
    if (inSkull(plan.whale, gx, gy)) return { topM: cfg.whale.skullM, material: 'rock' }
    toLocal(plan.frame, gx, gy, L)
    reachOf(plan.edges, L.a, L.b, R)
    if (R.lip < 0.3 && R.low > 0 && R.high > 0 && floorDepth(plan.edges, L.a, L.b) < 0.3) return null
    return ROCK
  }
  return makeSolids(at, b.x0, b.y0, b.cols, b.rows, b.cell)
}

function cfgOf(sim: Sim): DeepConfig {
  return MAPS[sim.mapId].deep!
}

/** 这一局的谷底：视图与规则按同一个种子各要一次 */
export function deepPlanFor(cfg: DeepConfig, decorSeed: number): DeepPlan {
  return deepPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

export function deepOf(sim: Sim): DeepState {
  let s = sim.worldState.deep
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = deepPlanFor(cfg, sim.run.decorSeed)
    const hull = hullOf(cfg.sub)
    const berth: Berth = { plan, hull, rim: rimOf(hull, RIM_POINTS), inner: innerOf(hull, 0.5) }
    const home = homePose(berth, cfg.sub)
    s = { ...berth, solids: solidsOf(cfg, plan), home, sub: newSub(cfg.sub, home), seen: 'down', drownAt: 0 }
    sim.worldState.deep = s
  }
  return s
}

/** (x, y) 此刻喘不喘得上气：潜艇停着、在门口那一片里 */
export function breathesAt(cfg: DeepConfig, s: DeepState, x: number, y: number): boolean {
  return breathable(s.sub) && atDoor(s.hull, cfg.sub, s.sub, x, y)
}

/** 艇底低过一个身体的高，艇身挡人 */
export function grounded(sub: Sub): boolean {
  return sub.h < OBSTACLES.body.heightM
}

/** 线段 a→b（像素）上穿过艇身的那一截：艇身从艇底往上高 tallM 米，探测在那一截的高度碰得上艇身、又要贯穿才过得去就挡下；按距离场一步步走进去、再走出来 */
function hullTrace(h: Hull, sub: Sub, tallM: number, probe: Probe, ax: number, ay: number, bx: number, by: number): Crossing | null {
  if (passCost(probe, 'steel') <= 0) return null
  toHull(sub, ax, ay, TA)
  toHull(sub, bx, by, TB)
  const du = TB.u - TA.u
  const dv = TB.v - TA.v
  const len = Math.max(Math.hypot(du, dv), 1e-6)
  const sd = (t: number): number => hullSd(h, TA.u + du * t, TA.v + dv * t)
  let t = 0
  let d = sd(0)
  for (let i = 0; d > 1e-3; i++) {
    t += d / len
    if (t >= 1 || i > 64) return null
    d = sd(t)
  }
  const t0 = t
  for (let i = 0; t < 1 && d <= 0 && i < 128; i++) {
    t = Math.min(1, t + Math.max(-d, 0.02) / len)
    d = sd(t)
  }
  const z0 = probeZ(probe, t0)
  const z1 = probeZ(probe, t)
  if (Math.max(z0, z1) < sub.h || Math.min(z0, z1) > sub.h + tallM) return null
  return { t0, t1: t, material: 'steel' }
}

/** 谷底上离边与石头至少 room 像素的一点：从 p 往外一圈圈找，近处找不到就退回开局站位 */
function openNear(plan: DeepPlan, p: Point, room: number): Point {
  const b = plan.basin
  for (let r = 0; r <= 8 * UNIT; r += 0.5 * UNIT) {
    const n = r === 0 ? 1 : Math.ceil((r * Math.PI * 2) / (0.5 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      if (roomAt(b, q.x, q.y) >= room) return q
    }
  }
  return { x: plan.start.x * UNIT, y: plan.start.y * UNIT }
}

/** 潜艇的新落点：离旧的 moveU 格之间、朝向随意，停得下（艇壁离边与石头至少 roomU 格）；先不压着队长，挑不到再不管；还挑不到就回开局停的地方，已经在那就原地落回去 */
function landing(sim: Sim, cfg: DeepConfig, s: DeepState, from: Pose): Pose {
  const c = cfg.sub
  const room = c.roomU * UNIT
  const lead = leaderPoint(sim)
  const [near, far] = c.moveU
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 64; i++) {
      const dir = sim.rng.next() * Math.PI * 2
      const d = (near + (far - near) * sim.rng.next()) * UNIT
      const p = { x: from.x + Math.cos(dir) * d, y: from.y + Math.sin(dir) * d, a: sim.rng.next() * Math.PI * 2 }
      if (!fits(s, c, p, room)) continue
      if (pass === 0 && hullGap(s.hull, p, lead.x, lead.y) < UNIT) continue
      return p
    }
  }
  return Math.hypot(s.home.x - from.x, s.home.y - from.y) > UNIT ? { ...s.home } : { ...from }
}

/** 潜艇离开谷底、落回谷底时沿艇壁扬起一圈泥 */
function stir(sim: Sim, s: DeepState): void {
  for (let i = 0; i < s.rim.length; i += 3) {
    const q = s.rim[i]!
    const p = fromHull(s.sub, q.u * 1.08, q.v * 1.15)
    sim.out.bursts.push({ x: p.x, y: p.y, count: 4, kind: 'silt' })
  }
}

/** 气见底、又不在潜艇门口的队员呛水掉血：满血的标准身体 drownSec 秒呛死，每 tickMs 结算一次 */
function drown(sim: Sim, s: DeepState, cfg: DeepConfig): void {
  const now = sim.elapsedMs
  if (now < s.drownAt) return
  const c = cfg.sub
  s.drownAt = now + c.tickMs
  const src = hazardSource('drown', DROWN_TINT)
  for (const m of sim.characters) {
    if (!Alive.v[m] || inTransit(m) || staminaLeft(m) > 0 || breathesAt(cfg, s, Transform.x[m]!, Transform.y[m]!)) continue
    hit(sim, src, m, Math.max(1, Math.round((Hp.max[m]! * c.tickMs) / 1000 / c.drownSec)), { tick: true })
  }
}

/**
 * 深海：能走的是两侧岩壁、上游岩堆与下游陡坎围着的一片谷底，谷底的大石头与鲸鱼的头骨挡路；岩壁和岩堆挡子弹和视线，大石头和头骨按高矮挡，陡坎外悬空，子弹从上面过去。
 * 一艘潜艇停在谷底上，艇身挡人、挡子弹也挡视线，敌人贴着艇壁绕过来；只有一舷开着门，门口那一片半圆喘得上气。
 * 队员离开门口只能憋着气：体力不回，一直往下掉，赶路掉得更快；回到门口走着也补。气见底了呛水掉血。
 * 潜艇隔一阵浮起来开到别处停下：开走的那一阵哪里都喘不上气，艇底高过身体就不再挡人，落下来压着谁就把谁挤开。海里的东西不用换气
 */
export const deep: WorldHooks = {
  ...bounded,
  breath(sim, eid) {
    if (!hasComponent(sim.world, eid, Slot)) return 0
    const cfg = cfgOf(sim)
    return breathesAt(cfg, deepOf(sim), Transform.x[eid]!, Transform.y[eid]!) ? cfg.sub.breath : -cfg.sub.hold
  },
  beacon(sim) {
    const s = deepOf(sim)
    return doorMid(s.hull, cfgOf(sim).sub, subTarget(s.sub))
  },
  /** 队长站在门口喘气时，落在门口那一片外面的坑位挪进来：跟着的队员也喘得上气 */
  seat(sim, from, at) {
    const s = deepOf(sim)
    const cfg = cfgOf(sim)
    if (!breathesAt(cfg, s, from.x, from.y) || atDoor(s.hull, cfg.sub, s.sub, at.x, at.y)) return at
    return intoDoor(s.hull, cfg.sub, s.sub, at, 0.5)
  },
  constrainBody(sim, eid, from, next) {
    if (phases(sim.world, eid, 'rock')) return bounded.constrainBody(sim, eid, from, next)
    const s = deepOf(sim)
    const r = Radius.v[eid]!
    const p = grounded(s.sub) ? outOfHull(s.hull, s.sub, next.x, next.y, r) : next
    return keepOut(s.plan.basin, p.x, p.y, r)
  },
  basin(sim) {
    return deepOf(sim).plan.basin
  },
  ground(sim) {
    return deepOf(sim).plan.basin
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (phases(sim.world, eid, 'rock')) return norm(tx - x, ty - y)
    const s = deepOf(sim)
    const r = Radius.v[eid]!
    const w = grounded(s.sub) ? aroundHull(s.hull, s.sub, x, y, tx, ty, r) : norm(tx - x, ty - y)
    return alongWall(s.plan.basin, x, y, w.x, w.y, r + 0.3 * UNIT)
  },
  trace(sim, probe, ax, ay, bx, by) {
    const s = deepOf(sim)
    const rock = solidsTrace(s.solids, probe, ax, ay, bx, by)
    const hull = hullTrace(s.hull, s.sub, cfgOf(sim).sub.heightM, probe, ax, ay, bx, by)
    return hull && (!rock || hull.t0 < rock.t0) ? hull : rock
  },
  solidAt(sim, x, y) {
    const s = deepOf(sim)
    if (grounded(s.sub) && hullGap(s.hull, s.sub, x, y) < 0) return { topM: s.sub.h + cfgOf(sim).sub.heightM, material: 'steel' }
    return solidOf(s.solids, x, y)
  },
  wanderDir(sim, eid, dx, dy) {
    const s = deepOf(sim)
    const b = s.plan.basin
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const r = Radius.v[eid]!
    const d = grounded(s.sub) ? offHull(s.hull, s.sub, x, y, { x: dx, y: dy }, r + 0.6 * UNIT) : { x: dx, y: dy }
    if (roomAt(b, x, y) > r + 0.6 * UNIT) return d
    const n = awayFromWall(b, x, y)
    const dot = d.x * n.x + d.y * n.y
    return dot >= 0 ? d : { x: d.x - 2 * dot * n.x, y: d.y - 2 * dot * n.y }
  },
  fleeDir(sim, eid, awayX, awayY) {
    const s = deepOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const r = Radius.v[eid]!
    const f = fleeSteer(x, y, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
    const d = grounded(s.sub) ? offHull(s.hull, s.sub, x, y, f, r + 0.6 * UNIT) : f
    return alongWall(s.plan.basin, x, y, d.x, d.y, r + 1.5 * UNIT)
  },
  /** 刷怪点落在谷底上、离边与石头至少一格，不压着潜艇；头目离队长更远 */
  spawnPoint(sim, boss) {
    const s = deepOf(sim)
    const plan = s.plan
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    let p: Point = { x: plan.start.x * UNIT, y: plan.start.y * UNIT }
    for (let i = 0; i < 48; i++) {
      p = { x: sim.rng.next() * sim.mapW, y: sim.rng.next() * sim.mapH }
      if (roomAt(plan.basin, p.x, p.y) < UNIT || hullGap(s.hull, s.sub, p.x, p.y) < UNIT) continue
      if ((p.x - lead.x) ** 2 + (p.y - lead.y) ** 2 >= far * far) return p
    }
    const q = openNear(plan, p, UNIT)
    return outOfHull(s.hull, s.sub, q.x, q.y, UNIT)
  },
  center(sim) {
    const st = deepOf(sim).plan.start
    return { x: st.x * UNIT, y: st.y * UNIT }
  },
  settle(sim, p) {
    const s = deepOf(sim)
    const q = openNear(s.plan, p, SPAWN.edgeInset * UNIT)
    return grounded(s.sub) ? outOfHull(s.hull, s.sub, q.x, q.y, SPAWN.edgeInset * UNIT) : q
  },
  canSpawn(sim, x, y, radius) {
    const s = deepOf(sim)
    return roomFor(s.plan.basin, x, y, radius) && (!grounded(s.sub) || hullGap(s.hull, s.sub, x, y) >= radius + 0.2 * UNIT)
  },
  /** 出怪口的地标之外再给关卡一处潜艇门口：停着时是门口，开走时是新落点的门口 */
  landmarks(sim) {
    const s = deepOf(sim)
    const door = doorMid(s.hull, cfgOf(sim).sub, subTarget(s.sub))
    return { ...s.plan.marks, door: [{ x: door.x, y: door.y, r: 0, nx: 0, ny: 0 }] }
  },
  /** 关卡要潜艇开走：停着时立刻起预兆，已经在走的照旧 */
  cue(sim, c) {
    const s = deepOf(sim)
    if (c === 'depart' && s.sub.phase === 'down') s.sub.next = sim.elapsedMs
  },
  onStart(sim) {
    deepOf(sim)
  },
  /** 潜艇按时开走、停下，离底与落底时扬起一圈泥；呛水按节拍结算 */
  tick(sim) {
    const cfg = cfgOf(sim)
    const s = deepOf(sim)
    const c = cfg.sub
    stepSub(
      s.sub,
      cfg,
      sim.elapsedMs,
      (from) => landing(sim, cfg, s, from),
      () => c.intervalMs + (sim.rng.next() * 2 - 1) * c.jitterMs,
    )
    if (s.sub.phase !== s.seen) {
      const departed = s.sub.phase === 'rise'
      const docked = s.sub.phase === 'down' && s.seen === 'settle'
      if (departed) mapEvent(sim, 'depart')
      if (docked) mapEvent(sim, 'dock')
      if (departed || docked) stir(sim, s)
      s.seen = s.sub.phase
    }
    drown(sim, s, cfg)
  },
}
