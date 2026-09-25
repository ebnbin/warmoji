import type { FeelTuning } from '../src/types/feel'

export const FEEL = {
  follow: { kBase: 230, kJitter: 0.3, zeta: 0.86, maxLag: 60 },
  pursuit: { arriveRadius: 0.25, slowRadius: 1.2, easeFloor: 0.3, leash: 6, catchUpMul: 1.5, snapDist: 12, separation: 0.7 },
  wander: { radius: 6, freqX: 0.8, freqY: 1.13, rampMs: 350 },
  hitShake: { durationMs: 60, intensity: 0.0012 },
  orbit: { detectRange: 4.5, maxSpeed: 2, avoidGain: 3.2, seekGain: 2.6 },
} as const satisfies FeelTuning
