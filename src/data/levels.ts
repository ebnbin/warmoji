import levelsJson from '../assets/levels.json'
import { fromJson } from './json'
import { MAX_CHAR_LEVEL } from './charLevel'
import type { CharacterId } from '../types/characters'
import type { StatMods } from '../types/stats'

/** 每名角色 2 级起每一级的属性：每一级各写各的，不累加 */
export const LEVEL_STATS = fromJson<Record<CharacterId, readonly StatMods[]>>(levelsJson)

export function levelStatsFor(id: CharacterId, level: number): StatMods[] {
  if (level <= 1) return []
  const tier = LEVEL_STATS[id][Math.min(level, MAX_CHAR_LEVEL) - 2]
  return tier ? [tier] : []
}
