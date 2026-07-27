import { query } from 'bitecs'
import { Collected, GrantMod } from '../components'
import { pickupDef } from '../store'
import { foldMods, spawnModifier } from '../entities/modifier'
import type { Sim } from '../sim'

/** 到手施加一层限时乘区（同 id 只刷新计时不叠加，随即重折乘区） */
export function grantMods(sim: Sim): void {
  for (const eid of query(sim.world, [Collected, GrantMod])) {
    const def = pickupDef[eid]
    if (!def) continue
    spawnModifier(sim, def) // 同 id 只刷新计时不叠加
    sim.battleFx = foldMods(sim)
    sim.out.collects.push(def)
  }
}
