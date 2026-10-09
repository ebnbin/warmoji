import type { ExperimentDef, FightDef, FightReward, PhaseDef } from '../src/types/runs'

/** 冒险的全队升级曲线 */
export const TEAM_LEVEL = { first: 26, ratio: 6, k: 4 } as const

/** 冒险里的一场就是一个实验的那一场：名字、难度时钟与过关奖励按这一章排，before 与 after 是接在实验前后的阶段 */
export function stage(
  e: ExperimentDef,
  name: string,
  clockSec: number,
  extra: { readonly before?: readonly PhaseDef[]; readonly after?: readonly PhaseDef[]; readonly reward?: FightReward } = {},
): FightDef {
  return { ...e.fight, name, clockSec, phases: [...(extra.before ?? []), ...e.fight.phases, ...(extra.after ?? [])], ...(extra.reward ? { reward: extra.reward } : {}) }
}
