import { query } from 'bitecs'
import { Despawn, Dormant, ENEMY_SET } from '../components'
import { despawnEnemy } from './shared/combat'
import type { Sim } from '../sim'

export function despawnExpired(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of [...query(sim.world, ENEMY_SET)]) {
    if (Dormant.v[eid]) continue
    if (Despawn.at[eid] !== 0 && now >= Despawn.at[eid]!) despawnEnemy(sim, eid)
  }
}
