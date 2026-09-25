import { query } from 'bitecs'
import { PICKUP_SET } from '../components'
import { animatePickup } from '../entities/pickup'
import type { Sim } from '../sim'

export function stepPickupVisuals(sim: Sim): void {
  for (const eid of query(sim.world, PICKUP_SET)) animatePickup(sim, eid)
}
