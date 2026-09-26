import { CHARACTERS, loadoutFor } from '../../data/characters'
import { aggregateCharacterEffects, characterXp, resolveAbilityDef } from '../../data/items'
import { levelStatsFor } from '../../data/levels'
import { characterLevel, tiersForLevel } from '../../data/charLevel'
import { toPx } from '../../data/px'
import { sandboxLevel } from '../sandbox/knobs'
import { FACTION } from '../components'
import { equipAbility, equipSkill } from './ability'
import { applyForm } from './form'
import type { AbilityDef } from '../../types/abilityDefs'
import type { RunState } from '../../run/state'
import type { Sim } from '../sim'

function memberFx(run: RunState, slot: number, sandbox: boolean): { fx: ReturnType<typeof aggregateCharacterEffects>; level: number } {
  const id = run.roster[slot]!
  const owned = sandbox ? [] : (run.memberItems[slot] ?? [])
  const level = sandbox ? sandboxLevel() + 1 : characterLevel(characterXp(owned))
  return { fx: aggregateCharacterEffects(owned, levelStatsFor(id, level)), level }
}

/** 队员的能力倍率：道具与等级折算成伤害、冷却、暴击、击退 */
export function memberAmp(sim: Sim, slot: number): { dmg: number; cd: number; crit: number; kb: number; battle: boolean } {
  const { fx } = memberFx(sim.run, slot, sim.sandbox)
  return { dmg: fx.damageMul, cd: fx.cooldownMul, crit: fx.critChance, kb: fx.knockbackMul, battle: true }
}

/** 装上队员的自动能力：不给就按等级取载体当前档 */
export function armCarriers(sim: Sim, slot: number, defs?: readonly AbilityDef[]): void {
  const { fx, level } = memberFx(sim.run, slot, sim.sandbox)
  const amp = memberAmp(sim, slot)
  const list = (defs ?? loadoutFor(CHARACTERS[sim.run.roster[slot]!], tiersForLevel(level))).map((w) => resolveAbilityDef(w, fx))
  list.forEach((w, i) => {
    equipAbility(sim, sim.characters[slot]!, toPx(w), FACTION.team, 300 + slot * 120 + i * 230, amp)
  })
}

export function armTeam(sim: Sim, run: RunState, _sandbox: boolean): void {
  for (let slot = 0; slot < run.roster.length; slot++) {
    const def = CHARACTERS[run.roster[slot]!]
    armCarriers(sim, slot)
    sim.skills[slot] = equipSkill(sim, sim.characters[slot]!, toPx(def.skill.ability), memberAmp(sim, slot), def.skill.cdMs, run.skillCd[slot] ?? 0)
    const form = run.memberForm[slot] ?? -1
    if (form >= 0) applyForm(sim, sim.characters[slot]!, form)
  }
}
