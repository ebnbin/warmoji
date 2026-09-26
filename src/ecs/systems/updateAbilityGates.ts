import { query } from 'bitecs'
import { Ability, Alive, Dancing, Disarmed, Dormant, Faction, FACTION, Frozen, Morph, Owner } from '../components'
import type { Sim } from '../sim'

export function updateAbilityGates(sim: Sim): void {
  const now = sim.elapsedMs
  for (const e of query(sim.world, [Ability, Owner, Frozen, Disarmed])) {
    const o = Owner.eid[e]!
    Frozen.v[e] = Alive.v[o] === 1 && Dormant.v[o] === 0 ? 0 : 1
    const morphed = Morph.until[o] !== 0 && now < Morph.until[o]!
    Disarmed.v[e] = morphed || (Faction.v[e] === FACTION.enemy && Dancing.until[o] !== 0) ? 1 : 0
  }
}
