import { query } from 'bitecs'
import { Alive, Hp, Stats } from '../components'
import type { Sim } from '../sim'

/** 生命回复：活着且没满血就按属性表每秒回 */
export function tickRegen(sim: Sim): void {
  const dt = sim.wdtMs / 1000
  for (const eid of query(sim.world, [Stats, Hp, Alive])) {
    const r = Stats.regen[eid]!
    if (r > 0 && Alive.v[eid] && Hp.v[eid]! < Hp.max[eid]!) Hp.v[eid] = Math.min(Hp.max[eid]!, Hp.v[eid]! + r * dt)
  }
}
