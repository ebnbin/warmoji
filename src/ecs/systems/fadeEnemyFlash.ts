import { query } from 'bitecs'
import { Dormant, ENEMY_SET, Flash } from '../components'
import type { Sim } from '../sim'

/** 受击白闪到时恢复 */
export function fadeEnemyFlash(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue
    if (Flash.until[eid] !== 0 && now >= Flash.until[eid]!) Flash.until[eid] = 0
  }
}
