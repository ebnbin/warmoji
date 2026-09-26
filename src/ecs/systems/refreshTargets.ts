import { query } from 'bitecs'
import { Alive, Dormant, Faction, Hidden, Hp, Radius, Transform, Uid } from '../components'
import type { Target } from '../utils/targets'
import type { Sim } from '../sim'

/** 每个阵营一份可被打的身体的快照：有生命、活着、不在休眠 */
export function refreshTargets(sim: Sim): void {
  const now = sim.elapsedMs
  const lists: Target[][] = [[], []]
  for (const eid of query(sim.world, [Hp, Faction, Transform, Radius, Alive])) {
    if (Alive.v[eid] === 0 || Dormant.v[eid]) continue
    const list = lists[Faction.v[eid]!]
    if (!list) continue
    list.push({
      eid,
      uid: Uid.v[eid]!,
      x: Transform.x[eid]!,
      y: Transform.y[eid]!,
      radius: Radius.v[eid]!,
      hidden: now < Hidden.until[eid]!,
    })
  }
  sim.targets = lists
}
