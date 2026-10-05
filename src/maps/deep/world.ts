import { hasComponent } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { Alive, Hp, Radius, Slot, Transform } from '../../ecs/components'
import { hit } from '../../ecs/systems/shared/damage'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { staminaLeft } from '../../ecs/systems/shared/stamina'
import { inTransit } from '../../ecs/utils/marks'
import { hazardSource } from '../../ecs/utils/source'
import { leaderPoint } from '../../ecs/utils/team'
import { phases } from '../../ecs/utils/pass'
import { bounded } from '../../ecs/worlds/hooks'
import { makeSolids, solidOf, solidsTrace } from '../../ecs/worlds/solids'
import { alongWall, awayFromWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { airRadius, bellTarget, breathable, newBell, stepBell } from './bell'
import { deepPlan, floorDepth, inBoulder, inSkull, reachOf, toLocal } from './layout'
import type { Bell } from './bell'
import type { DeepPlan, Local, Reach } from './layout'
import type { DeepConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { Solid, Solids } from '../../ecs/worlds/solids'
import type { WorldHooks } from '../../ecs/worlds/hooks'

/** 深海按布景种子打散出自己的种子 */
const PLAN_SEED = 0x0de9c5
const DROWN_TINT = 0x4fc3f7

/** 深海此刻的状态：按种子生成的谷底与它的实心，潜水钟，下一次结算呛水在几时 */
export interface DeepState {
  readonly plan: DeepPlan
  readonly solids: Solids
  readonly bell: Bell
  drownAt: number
}

const ROCK: Solid = { topM: Infinity, material: 'rock' }
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
    s = { plan, solids: solidsOf(cfg, plan), bell: newBell(cfg.bell, plan.start.x * UNIT, plan.start.y * UNIT), drownAt: 0 }
    sim.worldState.deep = s
  }
  return s
}

/** (x, y) 在不在钟口底下、喘不喘得上气 */
export function underBell(cfg: DeepConfig, b: Bell, x: number, y: number): boolean {
  return breathable(b) && Math.hypot(x - b.x, y - b.y) <= airRadius(cfg)
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

/** 钟的新落点：离旧落点 moveU 格之间、离边与石头至少 roomU 格；挑不到就放宽距离，再挑不到就回开局站位 */
function landing(sim: Sim, cfg: DeepConfig, plan: DeepPlan, from: Point): Point {
  const room = cfg.bell.roomU * UNIT
  const [near, far] = cfg.bell.moveU
  let best: Point | null = null
  let bestRoom = -Infinity
  for (let i = 0; i < 96; i++) {
    const a = sim.rng.next() * Math.PI * 2
    const d = (near + (far - near) * sim.rng.next()) * UNIT
    const q = { x: from.x + Math.cos(a) * d, y: from.y + Math.sin(a) * d }
    const r = roomAt(plan.basin, q.x, q.y)
    if (r >= room) return q
    if (r > bestRoom) {
      bestRoom = r
      best = q
    }
  }
  return best && bestRoom > 0 ? openNear(plan, best, room) : { x: plan.start.x * UNIT, y: plan.start.y * UNIT }
}

/** 气见底、钟口底下又喘不上气的队员呛水掉血：满血的标准身体 drownSec 秒呛死，每 tickMs 结算一次 */
function drown(sim: Sim, s: DeepState, cfg: DeepConfig): void {
  const now = sim.elapsedMs
  if (now < s.drownAt) return
  const c = cfg.bell
  s.drownAt = now + c.tickMs
  const src = hazardSource('drown', DROWN_TINT)
  for (const m of sim.characters) {
    if (!Alive.v[m] || inTransit(m) || staminaLeft(m) > 0 || underBell(cfg, s.bell, Transform.x[m]!, Transform.y[m]!)) continue
    hit(sim, src, m, Math.max(1, Math.round((Hp.max[m]! * c.tickMs) / 1000 / c.drownSec)), { tick: true })
  }
}

/**
 * 深海：能走的是两侧岩壁、上游岩堆与下游陡坎围着的一片谷底，谷底的大石头与鲸鱼的头骨挡路；岩壁和岩堆挡子弹和视线，大石头和头骨按高矮挡，陡坎外悬空，子弹从上面过去。
 * 队员离开潜水钟只能憋着气：体力不回，一直往下掉，赶路掉得更快；钟口底下那一圈喘得上气，走着也补。气见底了呛水掉血。
 * 钟隔一阵被吊起来、挪到别处放下：吊着的那一阵哪里都喘不上气。海里的东西不用换气
 */
export const deep: WorldHooks = {
  ...bounded,
  breath(sim, eid) {
    if (!hasComponent(sim.world, eid, Slot)) return 0
    const cfg = cfgOf(sim)
    return underBell(cfg, deepOf(sim).bell, Transform.x[eid]!, Transform.y[eid]!) ? cfg.bell.breath : -cfg.bell.hold
  },
  beacon(sim) {
    return bellTarget(deepOf(sim).bell)
  },
  constrainBody(sim, eid, from, next) {
    if (phases(sim.world, eid, 'rock')) return bounded.constrainBody(sim, eid, from, next)
    return keepOut(deepOf(sim).plan.basin, next.x, next.y, Radius.v[eid]!)
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
    const d = norm(tx - x, ty - y)
    if (phases(sim.world, eid, 'rock')) return d
    return alongWall(deepOf(sim).plan.basin, x, y, d.x, d.y, Radius.v[eid]! + 0.3 * UNIT)
  },
  trace(sim, probe, ax, ay, bx, by) {
    return solidsTrace(deepOf(sim).solids, probe, ax, ay, bx, by)
  },
  solidAt(sim, x, y) {
    return solidOf(deepOf(sim).solids, x, y)
  },
  wanderDir(sim, eid, dx, dy) {
    const b = deepOf(sim).plan.basin
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
    return alongWall(deepOf(sim).plan.basin, x, y, d.x, d.y, Radius.v[eid]! + 1.5 * UNIT)
  },
  /** 刷怪点落在谷底上、离边与石头至少一格；头目离队长更远 */
  spawnPoint(sim, boss) {
    const plan = deepOf(sim).plan
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
    const st = deepOf(sim).plan.start
    return { x: st.x * UNIT, y: st.y * UNIT }
  },
  settle(sim, p) {
    return openNear(deepOf(sim).plan, p, SPAWN.edgeInset * UNIT)
  },
  canSpawn(sim, x, y, radius) {
    return roomFor(deepOf(sim).plan.basin, x, y, radius)
  },
  landmarks(sim) {
    return deepOf(sim).plan.marks
  },
  onStart(sim) {
    deepOf(sim)
  },
  /** 钟按时挪窝；呛水按节拍结算 */
  tick(sim) {
    const cfg = cfgOf(sim)
    const s = deepOf(sim)
    const c = cfg.bell
    stepBell(
      s.bell,
      cfg,
      sim.elapsedMs,
      (from) => landing(sim, cfg, s.plan, from),
      () => c.intervalMs + (sim.rng.next() * 2 - 1) * c.jitterMs,
    )
    drown(sim, s, cfg)
  },
}
