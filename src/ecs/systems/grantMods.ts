import { query } from 'bitecs'
import { Collected, GrantMod } from '../components'
import { pickupDef } from '../store'
import type { FieldPickupDef } from '../../types/battlefield'
import type { Sim } from '../sim'
import { foldBattleEffects } from '../../war/battleFx'

/** 到手施加一层限时乘区（同 id 只刷新计时不叠加，随即重折乘区） */
export function grantMods(sim: Sim): void {
  for (const eid of query(sim.world, [Collected, GrantMod])) {
    const def = pickupDef[eid]
    if (!def) continue
    applyBattleMod(sim, def)
    sim.pendingCollects.push(def)
  }
}

/** 施加一层限时效果:同 id 只刷新计时不叠加,随即重折乘区 */
function applyBattleMod(sim: Sim, def: FieldPickupDef): void {
  sim.battleMods = sim.battleMods.filter((m) => m.id !== def.id)
  sim.battleMods.push({
    id: def.id,
    emoji: def.emoji,
    polarity: def.polarity,
    until: sim.elapsedMs + def.durationMs,
    totalMs: def.durationMs,
    fx: def.fx,
  })
  sim.battleFx = foldBattleEffects(sim.battleMods.map((m) => m.fx))
}
