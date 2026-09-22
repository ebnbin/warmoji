import type { AiTuning } from '../src/types/enemies'

export const AI = {
  // 换向间隔 [turnMinMs, turnMinMs + turnJitterMs)；spawn* 为出生后首次换向
  wander: { turnMinMs: 800, turnJitterMs: 1200, spawnTurnMinMs: 600, spawnTurnJitterMs: 900 },
  // 站位滞回带（格）：standoffDist ± band 内不动
  standoffBandU: 0.5,
  coinThiefEatCdMs: 650,
  fleeIdleSpeedMul: 0.4,
} as const satisfies AiTuning
