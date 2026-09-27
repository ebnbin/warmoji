import { query, removeEntity } from 'bitecs'
import { Due, Order } from '../components'
import { telegraphOne } from '../entities/enemy'
import type { Sim } from '../sim'

/** 到点的敌人按这一场的配比预告出来 */
export function fireOrders(sim: Sim): void {
  for (const eid of [...query(sim.world, [Due, Order])]) {
    if (sim.elapsedMs < Due.at[eid]!) continue
    telegraphOne(sim, Order.hpMul[eid]!, Order.forced[eid] === 1, Order.chance[eid]!)
    removeEntity(sim.world, eid)
  }
}
