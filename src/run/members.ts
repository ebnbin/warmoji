import { CHARACTERS, memberStats } from '../data/characters'
import { characterLevel, MAX_CHAR_LEVEL } from '../data/charLevel'
import { characterXp, gearMods } from '../data/items'
import { levelStatsFor } from '../data/levels'
import type { StatValues } from '../types/stats'
import { runTeamMods } from './rules'
import { runDef } from './state'
import type { RunState } from './state'

/** 这一局队员能到的最高等级 */
export function levelCap(run: RunState): number {
  return runDef(run).rules?.maxLevel ?? MAX_CHAR_LEVEL
}

/** 这一局靠全队升级：队员的等级来自升级时的选择，买道具不给角色经验 */
export function teamLeveled(run: RunState): boolean {
  return runDef(run).rules?.teamLevel === true
}

/** 攒了 xp 经验的队员是几级：不低于这一局的等级下限，不高于上限 */
export function levelFor(run: RunState, xp: number): number {
  return Math.min(levelCap(run), Math.max(run.minLevel, characterLevel(xp)))
}

/** 队员的等级：靠全队升级的一局按升级时的选择，否则按买过的道具折成的角色经验 */
export function memberLevel(run: RunState, slot: number): number {
  if (teamLeveled(run)) return Math.min(levelCap(run), Math.max(run.minLevel, run.memberLevels[slot] ?? 1))
  return levelFor(run, characterXp(run.memberItems[slot] ?? []))
}

/** 队员战斗外的属性：定位、道具、本局成长与等级，加上这一局规则与词缀给队伍的修正 */
export function memberOutStats(run: RunState, slot: number): StatValues {
  const id = run.roster[slot]!
  return memberStats(CHARACTERS[id], [...gearMods(run.memberItems[slot] ?? [], levelStatsFor(id, memberLevel(run, slot)), run.memberGrowth[slot]), ...runTeamMods(run)])
}

/** 队员战斗外的样子：局内进化过就是进化后的形态 */
export function memberLook(run: RunState, slot: number): string {
  const def = CHARACTERS[run.roster[slot]!]
  const form = run.memberForm[slot] ?? -1
  return (form >= 0 ? def.forms?.[form]?.emoji : undefined) ?? def.emoji
}
