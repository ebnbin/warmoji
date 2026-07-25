import type { TeamBaseline } from '../src/data/characters'

// 队伍/角色基线（创作层·不进运行时 bundle）：队形半径、复活基线、角色体型/血量/无敌帧。
// 队形几何与运行逻辑在 src/characters；这里只放设计数值，经 gen 校验产出 team.json。
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
