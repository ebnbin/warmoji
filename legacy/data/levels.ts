import levelsJson from '../assets/levels.json'
import { fromJson } from './json'
import type { CharacterId } from '../types/characters'
import type { StatMods } from '../types/stats'

/** 每名角色 2 级起每一级的属性：每一级各写各的，不累加 */
export const LEVEL_STATS = fromJson<Record<CharacterId, readonly StatMods[]>>(levelsJson)

/** 这名角色的等级上限：写了几级属性就能升到几级，一级都没写就不能升级 */
export function maxLevelOf(id: CharacterId): number {
  return LEVEL_STATS[id].length + 1
}

export function levelStatsFor(id: CharacterId, level: number): StatMods[] {
  if (level <= 1) return []
  const tier = LEVEL_STATS[id][Math.min(level, maxLevelOf(id)) - 2]
  return tier ? [tier] : []
}
