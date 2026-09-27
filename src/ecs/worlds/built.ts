import { query } from 'bitecs'
import { Transform, Zone, ZONE_SET } from '../components'
import { blockBody } from '../entities/barrier'
import type { Surface, WorldHooks } from './hooks'
import type { Sim } from '../sim'

/** 这一帧改地面的场：每帧只找一次 */
const grounds = { sim: null as Sim | null, at: -1, zones: [] as number[] }

function groundZones(sim: Sim): readonly number[] {
  if (grounds.sim === sim && grounds.at === sim.elapsedMs) return grounds.zones
  grounds.sim = sim
  grounds.at = sim.elapsedMs
  grounds.zones = [...query(sim.world, ZONE_SET)].filter((z) => (Zone.traction[z]! > 0 || Zone.exertion[z]! > 0) && Zone.on[z] !== 0)
  return grounds.zones
}

/** 场叠在地面上：抓地倍率连乘，费力相加 */
function groundAt(sim: Sim, s: Surface, x: number, y: number): Surface {
  let traction = s.traction
  let exertion = s.exertion
  for (const z of groundZones(sim)) {
    const d = sim.hooks.worldDelta(sim, Transform.x[z]!, Transform.y[z]!, x, y)
    const r = Zone.radius[z]!
    if (d.x * d.x + d.y * d.y > r * r) continue
    if (Zone.traction[z]! > 0) traction *= Zone.traction[z]!
    exertion += Zone.exertion[z]!
  }
  return traction === s.traction && exertion === s.exertion ? s : { ...s, traction, exertion }
}

/** 能力造出的地形叠在地图的规则上：场改地面，墙挡身体 */
export function withBuilt(base: WorldHooks): WorldHooks {
  return {
    ...base,
    surface(sim, x, y) {
      return groundAt(sim, base.surface(sim, x, y), x, y)
    },
    constrainBody(sim, eid, from, next) {
      return blockBody(sim, eid, from, base.constrainBody(sim, eid, from, next))
    },
  }
}
