import levelsJson from '../assets/levels.json'
import type { CharacterId } from '../types/characters'

import type { Tier } from '../types/levels'

export const LEVEL_STATS = levelsJson as unknown as Record<CharacterId, readonly [Tier, Tier]>

/** 2/3 级各取对应形态的完整片段，不叠加 */
export function levelStatsFor(id: CharacterId, level: number): Tier[] {
  if (level <= 1) return []
  const tier = LEVEL_STATS[id][Math.min(level, 3) - 2]
  return tier ? [tier] : []
}
