import type { TeamBaseline } from '../src/types/characters'

export const TEAM_BASELINE = {
  team: {
    maxSize: 5,
    leaderSizeMul: 1.25,
    followerSizeMul: 0.75,
    leaderGrip: 8,
    followerGrip: 1,
  },
  member: {
    size: 1.2,
    radius: 0.45,
    stats: { maxHp: 100, iframes: 700, revive: 10_000, magnet: 2.25 },
    traits: ['breathes'],
  },
  instinct: { leash: 5, margin: 0.4 },
} as const satisfies TeamBaseline
