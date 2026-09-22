import { query } from 'bitecs'
import { PICKUP_SET } from '../components'
import { animatePickup } from '../entities/pickup'
import type { Sim } from '../sim'

/** 过场冻结期用：只推进视觉 */
export function stepPickupVisuals(sim: Sim): void {
  for (const eid of query(sim.world, PICKUP_SET as unknown as object[])) animatePickup(sim, eid)
}
