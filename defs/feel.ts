import type { FeelTuning } from '../src/types/feel'

export const FEEL = {
  follow: { kBase: 230, kJitter: 0.3, zeta: 0.86, maxLag: 60 },
  squad: { fanDistance: 1.5, fanSpreadDeg: 120, seatRadius: 0.125, claimRadius: 0.5, seatHysteresis: 0.25, ghostSpeed: 10, reverseGain: 2, turnRateDeg: 240, recallDist: 14, handoverMs: 500, facingTauMs: 250 },
  wander: { radius: 6, freqX: 0.8, freqY: 1.13, rampMs: 350 },
  hitShake: { durationMs: 60, intensity: 0.0012 },
  orbit: { detectRange: 4.5, maxSpeed: 2, avoidGain: 3.2, seekGain: 2.6 },
} as const satisfies FeelTuning
