import { query, removeEntity } from 'bitecs'
import { Due, Surge } from '../components'
import { telegraphOne } from '../entities/enemy'
import type { Sim } from '../sim'

export function fireSurges(sim: Sim): void {
  for (const eid of [...query(sim.world, [Due, Surge])]) {
    if (sim.elapsedMs < Due.at[eid]!) continue
    telegraphOne(sim, Surge.hpMul[eid]!, Surge.forceElite[eid] === 1)
    removeEntity(sim.world, eid)
  }
}
