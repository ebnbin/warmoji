import { hasComponent, query } from 'bitecs'
import { Alive, HISTORY, HISTORY_MS, History, Hp, Transform } from '../../components'
import type { Sim } from '../../sim'

/** 每隔一拍记下每个身体的位置与生命 */
export function recordHistory(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, [History, Transform])) {
    if (now < History.at[eid]! || !Alive.v[eid]) continue
    History.at[eid] = now + HISTORY_MS
    const s = eid * HISTORY + History.i[eid]!
    History.x[s] = Transform.x[eid]!
    History.y[s] = Transform.y[eid]!
    History.hp[s] = hasComponent(sim.world, eid, Hp) ? Hp.v[eid]! : 0
    History.i[eid] = (History.i[eid]! + 1) % HISTORY
    History.n[eid] = Math.min(HISTORY, History.n[eid]! + 1)
  }
}

/** ms 前的那一格；记得不够久就取最早的一格，一格都没有返回 -1 */
export function historyAt(eid: number, ms: number): number {
  const n = History.n[eid]!
  if (n === 0) return -1
  const back = Math.min(n, Math.max(1, Math.round(ms / HISTORY_MS)))
  return eid * HISTORY + ((History.i[eid]! - back + HISTORY * 2) % HISTORY)
}
