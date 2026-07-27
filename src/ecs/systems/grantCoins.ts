import { query } from 'bitecs'
import { Collected, GrantCoins } from '../components'
import type { Sim } from '../sim'

/** 到手加钱 */
export function grantCoins(sim: Sim): void {
  for (const eid of query(sim.world, [Collected, GrantCoins])) {
    sim.run.coins += GrantCoins.n[eid]!
  }
}
