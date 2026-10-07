import type { FeelTuning } from '../src/types/feel'

export const FEEL = {
  squad: { fanDistance: 1.5, fanSpreadDeg: 120, seatRadius: 0.125, claimRadius: 0.5, seatHysteresis: 0.25, reverseGain: 2, turnRateDeg: 240, recallDist: 14, handoverMs: 500, facingTauMs: 250 },
  hitShake: { durationMs: 60, intensity: 0.0012 },
  // 弹一下的时长：出生的敌人与头目
  pop: { enemyMs: 130, bossMs: 320 },
  // 倒下的队员原地歪倒（tilt 弧度），停 holdMs 后淡出
  down: { fallMs: 160, tilt: 1.3, holdMs: 1000, fadeMs: 500 },
  // 归队：从 height 格高处落进坑位，落地压扁 squash 再回弹，脚下扩开 ringRadius 格的光环
  rejoin: { dropMs: 320, height: 3, fadeInMs: 120, bounceMs: 380, squash: 0.3, ringRadius: 1.1 },
  // 装置架起与退场的时长
  emplace: { popMs: 220, retireMs: 240 },
  entrance: {
    walk: { ms: 480, heightU: 0.3, distU: [1.2, 2.4] },
    climb: { ms: 560, heightU: 0.9, distU: [1, 2.2], outU: 0.7 },
    drop: { ms: 420, heightU: 2.6 },
    lob: { minMs: 700, msPerU: 70, heightPerU: 0.3 },
  },
} as const satisfies FeelTuning
