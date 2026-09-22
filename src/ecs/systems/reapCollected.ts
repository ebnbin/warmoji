import { query, removeEntity } from 'bitecs'
import { Collected } from '../components'
import { pickupDef, pickupSfx } from '../store'
import type { Sim } from '../sim'

/** 须排在所有 Grant 系统之后 */
export function reapCollected(sim: Sim): void {
  for (const eid of [...query(sim.world, [Collected])]) {
    pickupDef[eid] = undefined
    pickupSfx[eid] = undefined
    removeEntity(sim.world, eid)
  }
}
