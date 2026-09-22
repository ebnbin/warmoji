import type { TeamBaseline } from '../src/types/characters'

export const TEAM_BASELINE = {
  team: {
    ringRadius: 0.8,
    smallRingRadius: 0.58,
    pairGap: 1.1,
    reviveMs: 10_000,
    guardCenterHurtboxMul: 0.5,
  },
  member: {
    size: 1.2,
    radius: 0.45,
    maxHp: 100,
    iframesMs: 700,
  },
} as const satisfies TeamBaseline
