import { query } from 'bitecs'
import { ENEMY_SET, Flash } from '../components'
import type { Sim } from '../sim'

export function fadeEnemyFlash(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (Flash.until[eid] !== 0 && now >= Flash.until[eid]!) Flash.until[eid] = 0
  }
}
