import { query } from 'bitecs'
import { Ability, Alive, Disarmed, Dormant, Faction, FACTION, Frozen, Morph, Owner } from '../components'
import type { Sim } from '../sim'
import { isDancing } from '../utils/team'

export function updateAbilityGates(sim: Sim): void {
  const now = sim.elapsedMs
  const dancing = isDancing(sim)
  for (const e of query(sim.world, [Ability, Owner, Frozen, Disarmed])) {
    const o = Owner.eid[e]!
    Frozen.v[e] = Alive.v[o] === 1 && Dormant.v[o] === 0 ? 0 : 1
    const morphed = Morph.until[o] !== 0 && now < Morph.until[o]!
    Disarmed.v[e] = morphed || (dancing && Faction.v[e] === FACTION.enemy) ? 1 : 0
  }
}
