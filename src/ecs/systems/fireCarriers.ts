import { query, removeEntity } from 'bitecs'
import { Carrier, Due } from '../components'
import { spawnCarrier } from '../entities/enemy'
import { carrierPickup } from '../store'
import type { Sim } from '../sim'

export function fireCarriers(sim: Sim): void {
  for (const eid of [...query(sim.world, [Due, Carrier])]) {
    if (sim.elapsedMs < Due.at[eid]!) continue
    spawnCarrier(sim, carrierPickup[eid]!)
    removeEntity(sim.world, eid)
  }
}
