import { query, removeEntity } from 'bitecs'
import { Due, Surge } from '../components'
import { telegraphOne } from '../entities/enemy'
import type { Sim } from '../sim'

/** 敌潮排期到点：此刻才求落点与出怪表并挂预告 */
export function fireSurges(sim: Sim): void {
  // 快照迭代：spawnSurgeOne 会建预告实体，直接迭代活查询集会漏
  for (const eid of [...query(sim.world, [Due, Surge])]) {
    if (sim.elapsedMs < Due.at[eid]!) continue
    telegraphOne(sim, Surge.hpMul[eid]!, Surge.forceElite[eid] === 1)
    removeEntity(sim.world, eid)
  }
}
