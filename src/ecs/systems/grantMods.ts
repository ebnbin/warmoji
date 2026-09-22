import { query } from 'bitecs'
import { Collected, GrantMod } from '../components'
import { pickupDef } from '../store'
import { foldMods, spawnModifier } from '../entities/modifier'
import type { Sim } from '../sim'

export function grantMods(sim: Sim): void {
  for (const eid of query(sim.world, [Collected, GrantMod])) {
    const def = pickupDef[eid]
    if (!def) continue
    spawnModifier(sim, def)
    sim.battleFx = foldMods(sim)
    sim.out.collects.push(def)
  }
}
