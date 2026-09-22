import { query } from 'bitecs'
import { strike } from './shared/thrust'
import { Ability, Followup, Frozen, Thrust } from '../components'
import type { Sim } from '../sim'

export function tickCombos(sim: Sim): void {
  const dt = sim.wdtMs
  for (const e of query(sim.world, [Ability, Thrust, Followup])) {
    if (Followup.left[e]! <= 0 || Frozen.v[e]) continue
    Followup.left[e] = Followup.left[e]! - dt
    if (Followup.left[e]! > 0) continue
    Followup.left[e] = 0
    strike(sim, e)
  }
}
