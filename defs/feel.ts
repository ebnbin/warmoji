import type { FeelTuning } from '../src/types/feel'

export const FEEL = {
  follow: { kBase: 230, kJitter: 0.3, zeta: 0.86, maxLag: 60 },
  squad: { fanDistance: 1.5, fanSpreadDeg: 120, seatRadius: 0.125, claimRadius: 0.5, seatHysteresis: 0.25, ghostSpeed: 10, reverseGain: 2, turnRateDeg: 240, recallDist: 14, handoverMs: 500, facingTauMs: 250 },
  hitShake: { durationMs: 60, intensity: 0.0012 },
} as const satisfies FeelTuning
