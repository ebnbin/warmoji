import { hasComponent, query } from 'bitecs'
import { Alive, Faction, Hp, MARK, Mark, Radius, Revive, Transform, Uid } from '../components'
import { inTransit, isHidden, isUntargetable, markSlot, realmOf } from '../utils/marks'
import type { Target } from '../utils/targets'
import type { Sim } from '../sim'

/** 每个阵营一份有生命的身体的快照：倒地等待复活的也在，带 alive 标记；穿行中的没有实体，不在里面；看不见、碰不到与所在的界在这里定 */
export function refreshTargets(sim: Sim): void {
  const lists: Target[][] = [[], []]
  for (const eid of query(sim.world, [Hp, Faction, Transform, Radius, Alive])) {
    const alive = Alive.v[eid] === 1
    if ((!alive && !hasComponent(sim.world, eid, Revive)) || inTransit(eid)) continue
    const list = lists[Faction.v[eid]!]
    if (!list) continue
    const mist = markSlot(sim, eid, MARK.mist)
    list.push({
      eid,
      uid: Uid.v[eid]!,
      x: Transform.x[eid]!,
      y: Transform.y[eid]!,
      radius: Radius.v[eid]!,
      hidden: isHidden(sim, eid),
      untargetable: isUntargetable(sim, eid),
      realm: realmOf(sim, eid),
      mist: mist < 0 ? -1 : Mark.a[mist]!,
      mistUid: mist < 0 ? 0 : Mark.ref[mist]!,
      alive,
    })
  }
  sim.targets = lists
}
