import { CHARACTERS, memberStats } from '../data/characters'
import { characterLevel } from '../data/charLevel'
import { characterXp, gearMods } from '../data/items'
import { levelStatsFor } from '../data/levels'
import type { StatValues } from '../types/stats'
import type { RunState } from './state'

/** 队员的等级：买过的道具折成角色经验，不低于这一局的等级下限 */
export function memberLevel(run: RunState, slot: number): number {
  return Math.max(run.minLevel, characterLevel(characterXp(run.memberItems[slot] ?? [])))
}

/** 队员战斗外的属性：定位、道具、本局成长与等级 */
export function memberOutStats(run: RunState, slot: number): StatValues {
  const id = run.roster[slot]!
  return memberStats(CHARACTERS[id], gearMods(run.memberItems[slot] ?? [], levelStatsFor(id, memberLevel(run, slot)), run.memberGrowth[slot]))
}

/** 队员战斗外的样子：局内进化过就是进化后的形态 */
export function memberLook(run: RunState, slot: number): string {
  const def = CHARACTERS[run.roster[slot]!]
  const form = run.memberForm[slot] ?? -1
  return (form >= 0 ? def.forms?.[form]?.emoji : undefined) ?? def.emoji
}
