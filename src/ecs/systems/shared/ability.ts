import { addComponent, query } from 'bitecs'
import { Ability, CastRequest, Manual, Owner } from '../../components'
import { ABILITY_COMPS } from '../../entities/ability'
import type { Sim } from '../../sim'

export function requestCast(sim: Sim, ownerEid: number): void {
  for (const e of query(sim.world, [Ability, Manual])) {
    if (Owner.eid[e] === ownerEid) addComponent(sim.world, e, CastRequest)
  }
}

export function postponeAbilities(sim: Sim, ownerEid: number, ms: number): void {
  for (const comp of ABILITY_COMPS) {
    for (const e of query(sim.world, [Ability, comp, Owner])) {
      if (Owner.eid[e] === ownerEid) comp.cdLeft[e] = Math.max(comp.cdLeft[e]!, ms)
    }
  }
}

