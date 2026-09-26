import { query } from 'bitecs'
import { Transform, Zone, ZONE_SET } from '../components'
import { blockBody } from '../entities/barrier'
import type { WorldHooks } from './hooks'
import type { Sim } from '../sim'

/** 这一帧改抓地的场：每帧只找一次 */
const slippery = { sim: null as Sim | null, at: -1, zones: [] as number[] }

function tractionZones(sim: Sim): readonly number[] {
  if (slippery.sim === sim && slippery.at === sim.elapsedMs) return slippery.zones
  slippery.sim = sim
  slippery.at = sim.elapsedMs
  slippery.zones = [...query(sim.world, ZONE_SET)].filter((z) => Zone.traction[z]! > 0 && Zone.on[z] !== 0)
  return slippery.zones
}

/** 场内地面的抓地倍率连乘，没有场就是 1 */
function tractionAt(sim: Sim, x: number, y: number): number {
  let k = 1
  for (const z of tractionZones(sim)) {
    const d = sim.hooks.worldDelta(sim, Transform.x[z]!, Transform.y[z]!, x, y)
    const r = Zone.radius[z]!
    if (d.x * d.x + d.y * d.y <= r * r) k *= Zone.traction[z]!
  }
  return k
}

/** 能力造出的地形叠在地图的规则上：场改地面抓地，墙挡身体 */
export function withBuilt(base: WorldHooks): WorldHooks {
  return {
    ...base,
    surface(sim, x, y) {
      const s = base.surface(sim, x, y)
      const k = tractionAt(sim, x, y)
      return k === 1 ? s : { traction: s.traction * k, viscosity: s.viscosity }
    },
    constrainBody(sim, eid, from, next) {
      return blockBody(sim, eid, from, base.constrainBody(sim, eid, from, next))
    },
  }
}
