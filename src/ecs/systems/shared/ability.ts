import { addComponent, query } from 'bitecs'
import { Ability, Casting, CastRequest, Cd, Manual, Owner, Rushing, WindupState } from '../../components'
import type { Sim } from '../../sim'

export function requestCast(sim: Sim, ownerEid: number): void {
  for (const e of query(sim.world, [Ability, Manual])) {
    if (Owner.eid[e] === ownerEid) addComponent(sim.world, e, CastRequest)
  }
}

export function postponeAbilities(sim: Sim, ownerEid: number, ms: number): void {
  for (const e of query(sim.world, [Ability, Cd, Owner])) {
    if (Owner.eid[e] === ownerEid) Cd.left[e] = Math.max(Cd.left[e]!, ms)
  }
}

/** 打断：冲刺停下，蓄力作废 */
export function interrupt(sim: Sim, eid: number): void {
  Rushing.active[eid] = 0
  Casting.until[eid] = 0
  for (const e of query(sim.world, [Ability, WindupState, Owner])) if (Owner.eid[e] === eid) WindupState.until[e] = 0
}
