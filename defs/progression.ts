import type { Progression } from '../src/types/waves'

export const PROGRESSION = {
  reviveHpRatio: 0.3,
  restRatio: 0.5,
  summaryMs: 1600,
  coinDropChanceMin: 0.35,
  coinDropChanceHalfLifeSec: 220,
  xp: { base: 26, growth: 1.24, maxLevel: 15 },
} as const satisfies Progression
