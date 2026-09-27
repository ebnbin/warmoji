import { query } from 'bitecs'
import { Despawn, ENEMY_SET } from '../components'
import { despawnEnemy } from './shared/combat'
import type { Sim } from '../sim'

export function despawnExpired(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of [...query(sim.world, ENEMY_SET)]) {
    if (Despawn.at[eid] !== 0 && now >= Despawn.at[eid]!) despawnEnemy(sim, eid)
  }
}
