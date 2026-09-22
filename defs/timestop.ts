import type { TimeStopTuning } from '../src/types/timeStop'

export const TIMESTOP = {
  floor: 0.05,
  easeMs: 130,
  chillMaxAlpha: 0.5,
  chillColor: 0x040814,
  fadeMs: 140,
} as const satisfies TimeStopTuning
