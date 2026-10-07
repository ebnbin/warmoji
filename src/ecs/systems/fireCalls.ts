import { query, removeEntity } from 'bitecs'
import { Call, Due } from '../components'
import { callSpec } from '../store'
import { scheduleCall } from '../entities/schedule'
import { callSquad } from '../fight/spawns'
import type { Sim } from '../sim'

/** 到点的一队敌人登场；一再放出的一队排好下一次 */
export function fireCalls(sim: Sim): void {
  for (const eid of [...query(sim.world, [Due, Call])]) {
    const at = Due.at[eid]!
    if (sim.elapsedMs < at) continue
    const { rule, round } = callSpec[eid]!
    callSpec[eid] = undefined
    removeEntity(sim.world, eid)
    callSquad(sim, rule.squad, round === 0 ? rule.banner : undefined)
    if (rule.every !== undefined && round + 1 < (rule.times ?? Infinity)) scheduleCall(sim, at + rule.every, rule, round + 1)
  }
}
