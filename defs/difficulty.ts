import type { Difficulty } from '../src/types/enemies'

export const DIFFICULTY = {
  spawn: {
    startIntervalMs: 450,
    minIntervalMs: 80,
    rampSeconds: 300,
    hpGrowthPerMin: 0.5,
    maxAlive: 400,
    dormantTtlMs: 30000,
    teamFactorBase: 0.35,
    teamFactorPerMember: 0.13,
    telegraphMs: 900,
    markEmoji: '26a0',
    markSize: 1.0,
    minPlayerDist: 3,
    edgeInset: 0.5,
  },
  elite: {
    fromWave: 10,
    chance: 0.15,
    hpMul: 4,
    speedMul: 1.25,
    damageMul: 2,
    sizeMul: 1.2,
    xpMul: 4,
    coinsMul: 3,
  },
  surge: {
    count: 14,
    elites: 3,
    spreadMs: 2600,
  },
  bossSpawnRelief: 2,
} as const satisfies Difficulty
