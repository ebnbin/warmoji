import type { Progression } from '../src/types/waves'

export const PROGRESSION = {
  reviveHpRatio: 0.3,
  restRatio: 0.5,
  summaryMs: 1600,
  coinDropChanceMin: 0.35,
  coinDropChanceHalfLifeSec: 220,
  xp: { base: 80, growth: 1.15, waveBonusBase: 40, waveBonusPerWave: 36 },
} as const satisfies Progression
