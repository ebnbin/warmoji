import { query } from 'bitecs'
import { Ability, Cd, Frozen } from '../components'
import type { Sim } from '../sim'

export function tickCooldowns(sim: Sim): void {
  const dt = sim.wdtMs
  for (const e of query(sim.world, [Ability, Cd, Frozen])) {
    if (Frozen.v[e]) continue
    Cd.left[e] = Cd.left[e]! - dt
  }
}
