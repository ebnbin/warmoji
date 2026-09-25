import { LEVEL_STATS as LEVEL_TABLE } from '../../defs/levels'
import type { CharacterId } from '../types/characters'

import type { Tier } from '../types/levels'

export const LEVEL_STATS: Record<CharacterId, readonly [Tier, Tier]> = LEVEL_TABLE

export function levelStatsFor(id: CharacterId, level: number): Tier[] {
  if (level <= 1) return []
  const tier = LEVEL_STATS[id][Math.min(level, 3) - 2]
  return tier ? [tier] : []
}
