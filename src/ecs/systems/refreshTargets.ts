import { hasComponent, query } from 'bitecs'
import { Alive, Dormant, Faction, Hp, MARK, Radius, Revive, Transform, Uid } from '../components'
import { hasMark } from '../utils/marks'
import type { Target } from '../utils/targets'
import type { Sim } from '../sim'

/** 每个阵营一份有生命的身体的快照：不在休眠；倒地等待复活的也在，带 alive 标记 */
export function refreshTargets(sim: Sim): void {
  const lists: Target[][] = [[], []]
  for (const eid of query(sim.world, [Hp, Faction, Transform, Radius, Alive])) {
    if (Dormant.v[eid]) continue
    const alive = Alive.v[eid] === 1
    if (!alive && !hasComponent(sim.world, eid, Revive)) continue
    const list = lists[Faction.v[eid]!]
    if (!list) continue
    list.push({
      eid,
      uid: Uid.v[eid]!,
      x: Transform.x[eid]!,
      y: Transform.y[eid]!,
      radius: Radius.v[eid]!,
      hidden: hasMark(sim, eid, MARK.hide),
      alive,
    })
  }
  sim.targets = lists
}
