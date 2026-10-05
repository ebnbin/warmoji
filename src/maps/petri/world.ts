import { hasComponent } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { OBSTACLES } from '../../data/obstacles'
import { Radius, Slot, Transform } from '../../ecs/components'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { leaderPoint } from '../../ecs/utils/team'
import { solidOf, solidsTrace, wallsOf } from '../../ecs/worlds/solids'
import { bounded, wanderIn } from '../../ecs/worlds/hooks'
import { alongWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { colonyAt, dropLysin, makeColony, petriPlan, stepColony } from './model'
import type { ColonyField, PetriPlan } from './model'
import type { Solids } from '../../ecs/worlds/solids'
import type { MapId, PetriConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { Surface, WorldHooks } from '../../ecs/worlds/hooks'

/** 培养皿按布景种子打散出自己的种子，菌落场（增长率的噪声、开局菌落的熟度）再打散一次 */
const PLAN_SEED = 0x9e7a1d
const FIELD_SEED = 0x51c0b7

/** 培养皿此刻：按种子定下的皿与接种，玻璃壁（挡弹体与视线的实心），菌落场与它变过几次；积分攒下的时间 */
export interface PetriState {
  readonly plan: PetriPlan
  readonly solids: Solids
  readonly field: ColonyField
  version: number
  stepAcc: number
}

function cfgOf(sim: Sim): PetriConfig {
  return MAPS[sim.mapId].petri!
}

/** 这一局的培养皿：视图要它画皿，规则要它定边界，两边按同一个种子各要一次 */
export function petriPlanFor(cfg: PetriConfig, decorSeed: number): PetriPlan {
  return petriPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

export function petriOf(sim: Sim): PetriState {
  let s = sim.worldState.petri
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = petriPlanFor(cfg, sim.run.decorSeed)
    s = {
      plan,
      solids: wallsOf(plan.basin, 'glass'),
      field: makeColony(plan, cfg, (sim.run.decorSeed ^ FIELD_SEED) >>> 0),
      version: 0,
      stepAcc: 0,
    }
    sim.worldState.petri = s
  }
  return s
}

const AGAR = new Map<MapId, Surface>()

/** 没长菌落的琼脂面：费力与回复来自地图，其余同平地 */
function agarOf(sim: Sim): Surface {
  let g = AGAR.get(sim.mapId)
  if (!g) {
    const { exertion, regen } = MAPS[sim.mapId].stamina
    g = { traction: 1, viscosity: 1, exertion, regen }
    AGAR.set(sim.mapId, g)
  }
  return g
}

/** (x, y) 像素处是不是菌落：密度过了画成菌落的那条线 */
function inColony(sim: Sim, x: number, y: number): boolean {
  return colonyAt(petriOf(sim).field, x, y) >= cfgOf(sim).edge
}

/** 琼脂面上离皿壁至少 room 像素的一点：从 p 往外一圈圈找，近处找不到就退回皿心 */
function openNear(plan: PetriPlan, p: Point, room: number): Point {
  for (let r = 0; r <= 8 * UNIT; r += 0.5 * UNIT) {
    const n = r === 0 ? 1 : Math.ceil((r * Math.PI * 2) / (0.5 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      if (roomAt(plan.basin, q.x, q.y) >= room) return q
    }
  }
  return { x: plan.cx * UNIT, y: plan.cy * UNIT }
}

/**
 * 培养皿：能走的是圆形玻璃皿壁围着的琼脂面，皿壁是硬边界，挡身体也挡子弹，看得穿。菌落随时间往外长，皿边一圈永远有菌：
 * 我方角色踩进菌落就被粘住，几乎走不动、更费力，敌人不受影响；身体死在哪里就放下一团溶菌物质，溶掉那一圈菌落；菌落长过的掉落物被盖住
 */
export const petri: WorldHooks = {
  ...bounded,
  surface(sim, x, y, body) {
    const g = agarOf(sim)
    if (body === undefined || !hasComponent(sim.world, body, Slot) || !inColony(sim, x, y)) return g
    const stick = cfgOf(sim).stick
    return { traction: g.traction, viscosity: stick.viscosity, exertion: g.exertion + stick.exertion, regen: g.regen }
  },
  constrainBody(sim, eid, _from, next) {
    return keepOut(petriOf(sim).plan.basin, next.x, next.y, Radius.v[eid]!)
  },
  basin(sim) {
    return petriOf(sim).plan.basin
  },
  ground(sim) {
    return petriOf(sim).plan.basin
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = norm(tx - x, ty - y)
    return alongWall(petriOf(sim).plan.basin, x, y, d.x, d.y, Radius.v[eid]! + 0.3 * UNIT)
  },
  trace(sim, probe, ax, ay, bx, by) {
    return solidsTrace(petriOf(sim).solids, probe, ax, ay, bx, by)
  },
  solidAt(sim, x, y) {
    return solidOf(petriOf(sim).solids, x, y)
  },
  wanderDir(sim, eid, dx, dy) {
    return wanderIn(petriOf(sim).plan.basin, eid, dx, dy)
  },
  fleeDir(sim, eid, awayX, awayY) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = fleeSteer(x, y, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
    return alongWall(petriOf(sim).plan.basin, x, y, d.x, d.y, Radius.v[eid]! + 1.5 * UNIT)
  },
  /** 刷怪点落在琼脂面上、离皿壁至少一格；头目离队长更远 */
  spawnPoint(sim, boss) {
    const plan = petriOf(sim).plan
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    const R = plan.radius * UNIT
    let p: Point = { x: plan.cx * UNIT, y: plan.cy * UNIT }
    for (let i = 0; i < 48; i++) {
      const a = sim.rng.next() * Math.PI * 2
      const r = Math.sqrt(sim.rng.next()) * R
      p = { x: plan.cx * UNIT + Math.cos(a) * r, y: plan.cy * UNIT + Math.sin(a) * r }
      if (roomAt(plan.basin, p.x, p.y) < UNIT) continue
      if ((p.x - lead.x) ** 2 + (p.y - lead.y) ** 2 >= far * far) return p
    }
    return openNear(plan, p, UNIT)
  },
  center(sim) {
    const plan = petriOf(sim).plan
    return { x: plan.cx * UNIT, y: plan.cy * UNIT }
  },
  settle(sim, p) {
    return openNear(petriOf(sim).plan, p, SPAWN.edgeInset * UNIT)
  },
  canSpawn(sim, x, y, radius) {
    return roomFor(petriOf(sim).plan.basin, x, y, radius)
  },
  /** 溶菌物质随个头放大：按身体半径比标准身体大几倍 */
  died(sim, eid) {
    const s = petriOf(sim)
    dropLysin(s.field, cfgOf(sim), Transform.x[eid]!, Transform.y[eid]!, Radius.v[eid]! / (OBSTACLES.body.refRadiusU * UNIT))
    s.version++
  },
  covers(sim, x, y) {
    return inColony(sim, x, y)
  },
  onStart(sim) {
    petriOf(sim)
  },
  tick(sim, delta) {
    const cfg = cfgOf(sim)
    const s = petriOf(sim)
    const step = cfg.colony.stepMs
    s.stepAcc = Math.min(s.stepAcc + delta, step * 4)
    while (s.stepAcc >= step) {
      s.stepAcc -= step
      stepColony(s.field, cfg, step / 1000)
      s.version++
    }
  },
}
