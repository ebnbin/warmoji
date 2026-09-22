import { query } from 'bitecs'
import { Ability, Frozen } from '../components'
import { ABILITY_COMPS } from '../entities/ability'
import type { Sim } from '../sim'

export function tickCooldowns(sim: Sim): void {
  const dt = sim.wdtMs
  for (const comp of ABILITY_COMPS) {
    for (const e of query(sim.world, [Ability, comp, Frozen])) {
      if (Frozen.v[e]) continue
      comp.cdLeft[e] = comp.cdLeft[e]! - dt
    }
  }
}
