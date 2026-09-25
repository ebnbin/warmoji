import { CHARACTERS, loadoutFor } from '../../data/characters'
import { CAPTAINS } from '../../data/captains'
import { aggregateCharacterEffects, characterXp, resolveAbilityDef } from '../../data/items'
import { levelStatsFor } from '../../data/levels'
import { characterLevel, tiersForLevel } from '../../data/charLevel'
import { aggregateTeamCards } from '../../data/cards'
import { toPx } from '../../data/px'
import { sandboxLevel } from '../sandbox/knobs'
import { FACTION } from '../components'
import { equipAbility, NEUTRAL_AMP } from './ability'
import type { RunState } from '../../run/state'
import type { Sim } from '../sim'

export function armTeam(sim: Sim, run: RunState, sandbox: boolean): void {
  const teamFx = aggregateTeamCards(run.teamCards)
  for (let slot = 0; slot < run.roster.length; slot++) {
    const id = run.roster[slot]!
    const def = CHARACTERS[id]
    const owned = sandbox ? [] : (run.memberItems[slot] ?? [])
    const level = sandbox ? sandboxLevel() + 1 : characterLevel(characterXp(owned))
    const tiers = tiersForLevel(level)
    const fx = aggregateCharacterEffects(owned, levelStatsFor(id, level))
    const amp = {
      dmg: fx.damageMul * teamFx.teamDamageMul,
      cd: fx.cooldownMul * teamFx.teamCooldownMul,
      crit: fx.critChance + teamFx.critAdd,
      kb: fx.knockbackMul,
      battle: true,
    }
    loadoutFor(def, tiers).forEach((w, i) => {
      equipAbility(sim, sim.characters[slot]!, toPx(resolveAbilityDef(w, fx)), FACTION.team, 300 + slot * 120 + i * 230, amp)
    })
  }
}

export function armCaptain(sim: Sim, run: RunState): void {
  for (const a of CAPTAINS[run.captainId].skill.abilities) {
    equipAbility(sim, sim.captain, toPx(a), FACTION.team, 0, NEUTRAL_AMP, true)
  }
}
