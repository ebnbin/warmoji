import { CHARACTERS, memberStats } from '../data/characters'
import { gearMods } from '../data/items'
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

/** 这一局靠全队升级：队员的等级来自升级时的选择 */
export function teamLeveled(run: RunState): boolean {
  return runDef(run).teamLevel !== undefined
}

/** 这名角色这一局的等级，换下去也记着：靠全队升级的一局按升级时的选择，否则就是这一局的等级下限；都不高于他自己的上限 */
export function levelOf(run: RunState, id: CharacterId): number {
  const picked = teamLeveled(run) ? (run.kept[id]?.level ?? 1) : 1
  return Math.min(maxLevelOf(id), Math.max(run.minLevel, picked))
}

/** 场上这一格的人的等级 */
export function memberLevel(run: RunState, slot: number): number {
  return levelOf(run, run.roster[slot]!)
}

/** 队员战斗外的属性：定位、队伍道具与等级，加上这一局规则与词缀给队伍的修正 */
export function memberOutStats(run: RunState, slot: number): StatValues {
  const id = run.roster[slot]!
  return memberStats(CHARACTERS[id], [...gearMods(run.items, levelStatsFor(id, memberLevel(run, slot))), ...runTeamMods(run)])
}

/** 队员战斗外的样子：局内进化过就是进化后的形态 */
export function memberLook(run: RunState, slot: number): string {
  const def = CHARACTERS[run.roster[slot]!]
  const form = slotKept(run, slot).form
  return (form >= 0 ? def.forms?.[form]?.emoji : undefined) ?? def.emoji
}
