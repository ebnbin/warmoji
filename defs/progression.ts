import type { Progression } from '../src/types/waves'

export const PROGRESSION = {
  reviveHpRatio: 0.3,
  restRatio: 0.5,
  summaryMs: 1600,
  xp: { base: 26, growth: 1.24, maxLevel: 15 },
} as const satisfies Progression
