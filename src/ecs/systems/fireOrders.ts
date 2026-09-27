import { query, removeEntity } from 'bitecs'
import { Due, Order } from '../components'
import { telegraphOne } from '../entities/enemy'
import { foeSpec } from '../store'
import type { Sim } from '../sim'

/** 到点的敌人按要求预告出来 */
export function fireOrders(sim: Sim): void {
  for (const eid of [...query(sim.world, [Due, Order])]) {
    if (sim.elapsedMs < Due.at[eid]!) continue
    telegraphOne(sim, foeSpec[eid]!)
    removeEntity(sim.world, eid)
  }
}
