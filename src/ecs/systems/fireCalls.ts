import { query, removeEntity } from 'bitecs'
import { Call, Due } from '../components'
import { callRule } from '../store'
import { callBoss, callSquad } from '../fight/spawns'
import type { Sim } from '../sim'

/** 到点的一队敌人或头目登场 */
export function fireCalls(sim: Sim): void {
  for (const eid of [...query(sim.world, [Due, Call])]) {
    if (sim.elapsedMs < Due.at[eid]!) continue
    const rule = callRule[eid]!
    removeEntity(sim.world, eid)
    if (rule.kind === 'batch') callSquad(sim, rule.squad, rule.banner)
    else callBoss(sim)
  }
}
