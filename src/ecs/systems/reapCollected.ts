import { query, removeEntity } from 'bitecs'
import { Collected } from '../components'
import { pickupDef, pickupSfx } from '../store'
import type { Sim } from '../sim'

/** 到手的拾取物统一回收——**必须排在所有 Grant 系统之后**，否则效果还没结算就没了 */
export function reapCollected(sim: Sim): void {
  for (const eid of [...query(sim.world, [Collected])]) {
    pickupDef[eid] = undefined
    pickupSfx[eid] = undefined
    removeEntity(sim.world, eid)
  }
}
