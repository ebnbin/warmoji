import type { AiTuning } from '../src/types/enemies'

export const AI = {
  wander: { turnMinMs: 800, turnJitterMs: 1200, spawnTurnMinMs: 600, spawnTurnJitterMs: 900 },
  standoffBandU: 0.5,
  coinThiefEatCdMs: 650,
  fleeIdleSpeedMul: 0.4,
} as const satisfies AiTuning
