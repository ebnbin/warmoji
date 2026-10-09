import { query, removeEntity } from 'bitecs'
import { Fx } from '../components'
import type { Sim } from '../sim'

export function expireFx(sim: Sim): void {
  for (const eid of [...query(sim.world, [Fx])]) {
    if (sim.fxMs - Fx.bornMs[eid]! < Fx.durMs[eid]!) continue
    removeEntity(sim.world, eid)
  }
}
