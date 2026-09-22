import type { Progression } from '../src/types/waves'

export const PROGRESSION = {
  waveDurationsSec: [20, 20, 25, 25, 30, 30, 40, 40, 40, 60, 50, 50, 50, 50, 70, 60, 60, 90],
  eliteWaves: [10, 15],
  loopFrom: 7,
  reviveHpRatio: 0.3,
  summaryMs: 1600,
  coinDropChanceMin: 0.35,
  coinDropChanceHalfLifeSec: 220,
  xp: { base: 80, growth: 1.15, waveBonusBase: 40, waveBonusPerWave: 36 },
  recruit: { poolSize: 10, unlocks: [4, 6, 8, 9, 10] },
} as const satisfies Progression
