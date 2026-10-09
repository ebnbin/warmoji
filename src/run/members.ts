import { CHARACTERS, memberStats } from '../data/characters'
import { characterLevel } from '../data/charLevel'
import { characterXp, gearMods } from '../data/items'
import { levelStatsFor, maxLevelOf } from '../data/levels'
import type { CharacterId } from '../types/characters'
import type { StatValues } from '../types/stats'
import { runTeamMods } from './rules'
import { runDef, slotKept } from './state'
import type { RunState } from './state'

/** 场上这一格的人能到的最高等级 */
export function levelCap(run: RunState, slot: number): number {
  return maxLevelOf(run.roster[slot]!)
}

/** 这一局靠全队升级：队员的等级来自升级时的选择，买道具不给角色经验 */
export function teamLeveled(run: RunState): boolean {
  return runDef(run).teamLevel !== undefined
}

/** 攒了 xp 经验的这名角色是几级：不低于这一局的等级下限，不高于他自己的上限 */
export function levelFor(run: RunState, id: CharacterId, xp: number): number {
  return Math.min(maxLevelOf(id), Math.max(run.minLevel, characterLevel(xp)))
}

/** 这名角色这一局的等级，换下去也记着：靠全队升级的一局按升级时的选择，否则按买过的道具折成的角色经验 */
export function levelOf(run: RunState, id: CharacterId): number {
  const k = run.kept[id]
  if (teamLeveled(run)) return Math.min(maxLevelOf(id), Math.max(run.minLevel, k?.level ?? 1))
  return levelFor(run, id, characterXp(k?.items ?? []))
}

/** 场上这一格的人的等级 */
export function memberLevel(run: RunState, slot: number): number {
  return levelOf(run, run.roster[slot]!)
}

/** 队员战斗外的属性：定位、道具、本局成长与等级，加上这一局规则与词缀给队伍的修正 */
export function memberOutStats(run: RunState, slot: number): StatValues {
  const id = run.roster[slot]!
  const k = slotKept(run, slot)
  return memberStats(CHARACTERS[id], [...gearMods(k.items, levelStatsFor(id, memberLevel(run, slot)), k.growth), ...runTeamMods(run)])
}

/** 队员战斗外的样子：局内进化过就是进化后的形态 */
export function memberLook(run: RunState, slot: number): string {
  const def = CHARACTERS[run.roster[slot]!]
  const form = slotKept(run, slot).form
  return (form >= 0 ? def.forms?.[form]?.emoji : undefined) ?? def.emoji
}
