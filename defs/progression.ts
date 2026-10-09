import type { Progression } from '../src/types/waves'

export const PROGRESSION = {
  summaryMs: 1600,
  xp: { first: 26, ratio: 6, k: 4 },
} as const satisfies Progression
