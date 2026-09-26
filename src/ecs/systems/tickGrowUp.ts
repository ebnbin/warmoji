import { query } from 'bitecs'
import { Alive, Dormant, Faction, GrowUp, Hp, Nest, Transform } from '../components'
import { enemyDef } from '../store'
import { despawnEnemy } from './shared/combat'
import { summonBody } from '../entities/summon'
import type { Sim } from '../sim'

/** 延时成长：到点还活着就原地长成下一种，生命按原来的比例放大，仍记在原召唤者名下 */
export function tickGrowUp(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of [...query(sim.world, [GrowUp])]) {
    if (now < GrowUp.at[eid]! || !Alive.v[eid] || Dormant.v[eid]) continue
    const def = enemyDef[eid]
    const into = def?.grow?.into
    if (!def || !into) continue
    const hp = Math.round(into.hp * (Hp.max[eid]! / Math.max(1, def.hp)))
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const by = Nest.of[eid]!
    const faction = Faction.v[eid]!
    despawnEnemy(sim, eid)
    summonBody(sim, into, x, y, hp, faction, by)
  }
}
