import type { Progression } from '../src/types/waves'

export const PROGRESSION = {
  // 下标 = 波次 - 1；末波为 Boss 波
  waveDurationsSec: [20, 20, 25, 25, 30, 30, 40, 40, 40, 60, 50, 50, 50, 50, 70, 60, 60, 90],
  eliteWaves: [10, 15],
  // 无尽模式循环段 = [loopFrom, 末波]
  loopFrom: 7,
  reviveHpRatio: 0.3,
  summaryMs: 1600,
  coinDropChanceMin: 0.35,
  coinDropChanceHalfLifeSec: 220,
  xp: { base: 80, growth: 1.15, waveBonusBase: 40, waveBonusPerWave: 36 },
  // unlocks 按已开放编制数查表得可选张数
  recruit: { poolSize: 10, unlocks: [4, 6, 8, 9, 10] },
} as const satisfies Progression
