import { CHARACTERS, loadoutFor } from '../../data/characters'
import { ITEMS, characterXp, resolveAbilityDef } from '../../data/items'
import { characterLevel, tiersForLevel } from '../../data/charLevel'
import { toPx } from '../../data/px'
import { sandboxLevel } from '../sandbox/knobs'
import { FACTION, Stats } from '../components'
import { equipAbility, equipSkill } from './ability'
import { applyForm } from './form'
import type { AbilityDef } from '../../types/abilityDefs'
import type { GrowthProgress, ItemId } from '../../types/items'
import type { RunState } from '../../run/state'
import type { Sim } from '../sim'

/** 队员带进这一波的道具、本局成长与等级：沙盒里没有道具与成长，等级由旋钮定 */
export function memberGear(run: RunState, slot: number, sandbox: boolean): { owned: readonly ItemId[]; growth: GrowthProgress; level: number } {
  const owned = sandbox ? [] : (run.memberItems[slot] ?? [])
  return { owned, growth: sandbox ? {} : (run.memberGrowth[slot] ?? {}), level: sandbox ? sandboxLevel() + 1 : characterLevel(characterXp(owned)) }
}

/** 装上队员的自动能力：不给就按等级取载体当前档，再加上道具附带的装置；形状按属性表的攻击范围与弹速缩放 */
export function armCarriers(sim: Sim, slot: number, defs?: readonly AbilityDef[]): void {
  const m = sim.characters[slot]!
  const { owned, level } = memberGear(sim.run, slot, sim.sandbox)
  const fx = { range: Stats.range[m]!, projSpeed: Stats.projSpeed[m]! }
  const own = defs ?? loadoutFor(CHARACTERS[sim.run.roster[slot]!], tiersForLevel(level))
  const list = [...own, ...owned.flatMap((id) => ITEMS[id].ability ?? [])]
  list.forEach((w, i) => {
    equipAbility(sim, m, toPx(resolveAbilityDef(w, fx)), FACTION.team, 300 + slot * 120 + i * 230)
  })
}

export function armTeam(sim: Sim, run: RunState, _sandbox: boolean): void {
  for (let slot = 0; slot < run.roster.length; slot++) {
    const def = CHARACTERS[run.roster[slot]!]
    armCarriers(sim, slot)
    sim.skills[slot] = equipSkill(sim, sim.characters[slot]!, toPx(def.skill.ability), def.skill.cdMs, run.skillCd[slot] ?? 0)
    const form = run.memberForm[slot] ?? -1
    if (form >= 0) applyForm(sim, sim.characters[slot]!, form)
  }
}
