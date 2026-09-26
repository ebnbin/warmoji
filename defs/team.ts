import type { TeamBaseline } from '../src/types/characters'

export const TEAM_BASELINE = {
  team: {
    maxSize: 5,
    reviveMs: 10_000,
    leaderSizeMul: 1.25,
    followerSizeMul: 0.75,
    leaderGrip: 8,
    followerGrip: 1,
  },
  member: {
    size: 1.2,
    radius: 0.45,
    maxHp: 100,
    iframesMs: 700,
  },
} as const satisfies TeamBaseline
