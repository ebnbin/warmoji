import { addComponent, query } from 'bitecs'
import { Ability, CastRequest, Cd, Manual, Owner } from '../../components'
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
