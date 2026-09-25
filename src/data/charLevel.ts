import type { UpgradeTiers } from '../types/characters'

export const CHAR_XP_THRESHOLDS = [80, 320] as const
export const MAX_CHAR_LEVEL = CHAR_XP_THRESHOLDS.length + 1

export function characterLevel(xp: number): number {
  let level = 1
  for (const t of CHAR_XP_THRESHOLDS) if (xp >= t) level += 1
  return level
}

export function tiersForLevel(level: number): UpgradeTiers {
  return { u1: level >= 2, u2: level >= 3 }
}
