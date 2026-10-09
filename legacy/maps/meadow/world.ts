import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { Radius, Transform } from '../../ecs/components'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { leaderPoint } from '../../ecs/utils/team'
import { awayFromWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { beyondFence, footAt, forestDepth, meadowPlan, toLocal } from './layout'
import { makeSolids, solidOf, solidsTrace } from '../../ecs/worlds/solids'
import type { Solid, Solids } from '../../ecs/worlds/solids'
import { meadowMarks } from './marks'
import type { Local, MeadowPlan } from './layout'
import type { Basin } from '../basin'
import type { MapId, MeadowConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { Landmark } from '../landmark'
import type { Surface, WorldHooks } from '../../ecs/worlds/hooks'

const ZERO: Point = { x: 0, y: 0 }
/** 草甸按布景种子打散出自己的种子 */
const PLAN_SEED = 0x6d3ad0

/** 草甸此刻的状态：只有按种子生成的地图、它上面的地标与林子、陡坡和栅栏的实心，没有会变的东西 */
export interface MeadowState {
  readonly plan: MeadowPlan
  readonly marks: Readonly<Record<string, readonly Landmark[]>>
  readonly solids: Solids
}

const FOREST: Solid = { topM: Infinity, material: 'wood' }
const BANK: Solid = { topM: Infinity, material: 'earth' }

/** 林子与陡坡（连同坡上那层草甸）高过一切；栅栏按栅高占一格宽的一条线，有缝，弹体与视线照样过去 */
function solidsOf(cfg: MeadowConfig, plan: MeadowPlan): Solids {
  const e = plan.edges
  const b = plan.basin
  const fence: Solid = { topM: cfg.fence.heightM, material: 'fence' }
  const half = b.cell / UNIT / 2
  const l: Local = { a: 0, b: 0 }
  const at = (x: number, y: number): Solid | null => {
    toLocal(plan.frame, x / UNIT, y / UNIT, l)
    if (l.a <= footAt(e, l.b)) return BANK
    if (forestDepth(e, l.a, l.b) >= 0) return FOREST
    return Math.abs(beyondFence(e, l.a, l.b)) <= half ? fence : null
  }
  return makeSolids(at, b.x0, b.y0, b.cols, b.rows, b.cell)
}

function cfgOf(sim: Sim): MeadowConfig {
  return MAPS[sim.mapId].meadow!
}

/** 这一局的草甸：视图要它定地图的大小，规则要它定边界，两边按同一个种子各要一次 */
export function meadowPlanFor(cfg: MeadowConfig, decorSeed: number): MeadowPlan {
  return meadowPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

export function meadowOf(sim: Sim): MeadowState {
  let s = sim.worldState.meadow
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = meadowPlanFor(cfg, sim.run.decorSeed)
    s = { plan, marks: meadowMarks(plan), solids: solidsOf(cfg, plan) }
    sim.worldState.meadow = s
  }
  return s
}

const GROUNDS = new Map<MapId, Surface>()

/** 草地：费力与回复来自地图，其余同平地 */
function groundOf(sim: Sim): Surface {
  let g = GROUNDS.get(sim.mapId)
  if (!g) {
    const { exertion, regen } = MAPS[sim.mapId].stamina
    g = { traction: 1, viscosity: 1, exertion, regen }
    GROUNDS.set(sim.mapId, g)
  }
  return g
}

/** 离边 reach 像素以内几乎正对着边走时改为顺着边走，免得顶在林缘、栅栏或坡脚上不动；斜着撞上的由碰撞自己滑开 */
function alongWall(b: Basin, x: number, y: number, dx: number, dy: number, reach: number): Point {
  if (roomAt(b, x, y) > reach) return { x: dx, y: dy }
  const n = awayFromWall(b, x, y)
  if (dx * n.x + dy * n.y > -0.9) return { x: dx, y: dy }
  const side = dy * n.x - dx * n.y >= 0 ? 1 : -1
  return { x: -n.y * side, y: n.x * side }
}

/** 草地上离边至少 room 像素的一点：从 p 往外一圈圈找，近处找不到就退回开局站位 */
function openNear(plan: MeadowPlan, p: Point, room: number): Point {
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

/**
 * 草甸：能走的是林子、栅栏和陡坡围着的一片草地，场里没有障碍，也没有任何特殊规则。
 * 林缘、栅栏与坡脚是硬边界，身体走到跟前就停住、顺着边滑；林子与陡坡挡子弹和视线，栅栏有缝，子弹照样穿过去
 */
export const meadow: WorldHooks = {
  worldDelta(_sim, fromX, fromY, toX, toY) {
    return { x: toX - fromX, y: toY - fromY }
  },
  wrap(_sim, x, y) {
    return { x, y }
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
    return keepOut(meadowOf(sim).plan.basin, next.x, next.y, Radius.v[eid]!)
  },
  basin(sim) {
    return meadowOf(sim).plan.basin
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = norm(tx - x, ty - y)
    return alongWall(meadowOf(sim).plan.basin, x, y, d.x, d.y, Radius.v[eid]! + 0.3 * UNIT)
  },
  trace(sim, probe, ax, ay, bx, by) {
    return solidsTrace(meadowOf(sim).solids, probe, ax, ay, bx, by)
  },
  solidAt(sim, x, y) {
    return solidOf(meadowOf(sim).solids, x, y)
  },
  wanderDir(sim, eid, dx, dy) {
    const b = meadowOf(sim).plan.basin
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
    return alongWall(meadowOf(sim).plan.basin, x, y, d.x, d.y, Radius.v[eid]! + 1.5 * UNIT)
  },
  outside(sim, x, y) {
    return x < -UNIT || x > sim.mapW + UNIT || y < -UNIT || y > sim.mapH + UNIT
  },
  /** 刷怪点落在草地上、离边至少一格；头目离队长更远 */
  spawnPoint(sim, boss) {
    const plan = meadowOf(sim).plan
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
    const st = meadowOf(sim).plan.start
    return { x: st.x * UNIT, y: st.y * UNIT }
  },
  settle(sim, p) {
    return openNear(meadowOf(sim).plan, p, SPAWN.edgeInset * UNIT)
  },
  ground(sim) {
    return meadowOf(sim).plan.basin
  },
  canSpawn(sim, x, y, radius) {
    return roomFor(meadowOf(sim).plan.basin, x, y, radius)
  },
  landmarks(sim) {
    return meadowOf(sim).marks
  },
  lean() {
    return ZERO
  },
  onStart(sim) {
    meadowOf(sim)
  },
  tick() {},
}
