import type { FeelTuning } from '../src/types/feel'

export const FEEL = {
  squad: { fanDistance: 1.5, fanSpreadDeg: 120, seatRadius: 0.125, claimRadius: 0.5, seatHysteresis: 0.25, ghostSpeed: 10, reverseGain: 2, turnRateDeg: 240, recallDist: 14, handoverMs: 500, facingTauMs: 250 },
  hitShake: { durationMs: 60, intensity: 0.0012 },
  // 弹一下的时长：复活的角色、出生的敌人与头目
  pop: { reviveMs: 200, enemyMs: 130, bossMs: 320 },
  // 装置架起与退场的时长
  emplace: { popMs: 220, retireMs: 240 },
} as const satisfies FeelTuning
