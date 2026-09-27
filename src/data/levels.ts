import levelsJson from '../assets/levels.json'
import { fromJson } from './json'
import type { CharacterId } from '../types/characters'
import type { StatMods } from '../types/stats'

export const LEVEL_STATS = fromJson<Record<CharacterId, readonly [StatMods, StatMods]>>(levelsJson)

export function levelStatsFor(id: CharacterId, level: number): StatMods[] {
  if (level <= 1) return []
  const tier = LEVEL_STATS[id][Math.min(level, 3) - 2]
  return tier ? [tier] : []
}
