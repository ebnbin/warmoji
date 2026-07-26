import { query } from 'bitecs'
import { Despawn, Dormant, ENEMY_SET } from '../components'
import { despawnEnemy } from '../combat'
import type { Sim } from '../sim'

/** 定时静默移除:亡语诱饵尸壳到时离场(不计击杀、不掉落、不放死亡效果) */
export function despawnExpired(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of [...query(sim.world, ENEMY_SET as unknown as object[])]) {
    if (Dormant.v[eid]) continue
    if (Despawn.at[eid] !== 0 && now >= Despawn.at[eid]!) despawnEnemy(sim, eid)
  }
}
