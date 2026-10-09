import type { Difficulty } from '../legacy/types/enemies'

export const DIFFICULTY = {
  curve: {
    hpGrowthPerMin: 0.5,
    startIntervalMs: 450,
    minIntervalMs: 80,
    rampSeconds: 300,
    teamFactorBase: 0.35,
    teamFactorPerMember: 0.13,
    coinDropChanceMin: 0.35,
    coinDropChanceHalfLifeSec: 220,
  },
  spawn: {
    maxAlive: 400,
    telegraphMs: 900,
    markEmoji: '26a0',
    markSize: 1.0,
    minPlayerDist: 3,
    edgeInset: 0.5,
  },
  elite: {
    stats: { mul: { maxHp: 4, moveSpeed: 1.25, damage: 2, healing: 2, scale: 1.2 } },
    xpMul: 4,
    coinsMul: 3,
    affixes: { min: 1, max: 2 },
  },
  surge: {
    count: 14,
    elites: 3,
    spreadMs: 2600,
  },
  tenacity: {
    boss: { fillMs: 3000, steadfastMs: 5000 },
    elite: { fillMs: 2000, steadfastMs: 3000 },
    interruptMs: 400,
    drainMs: 6000,
  },
} as const satisfies Difficulty
