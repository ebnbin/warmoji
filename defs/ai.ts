import type { AiTuning } from '../src/types/enemies'

export const AI = {
  wander: { turnMinMs: 800, turnJitterMs: 1200, spawnTurnMinMs: 600, spawnTurnJitterMs: 900 },
  standoffBandU: 0.5,
  coinThiefEatCdMs: 650,
  // 没有目标时游荡的速度倍率
  idleSpeedMul: { chase: 0.5, standoff: 0.5, coinThief: 0.3, flee: 0.4 },
  // 出生后多久开第一枪
  firstShot: { minMs: 900, jitterMs: 1500 },
} as const satisfies AiTuning
