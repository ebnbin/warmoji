
// 队伍经验：击杀 + 波末保底两条腿（短波杀怪少，保底占比更高）。
// 每升 1 级 = 1 次团队升级抽卡（战斗后开卡页三选一，见 cards/registry.ts）。
// 前快后慢的等比曲线，无上限：升级不冻结（无尽模式直接复用这条曲线）。
// 校准目标（15 波制）：第 1 波结束 2~3 级，无经验加成队长通关约 22~24 级。

export interface XpState {
  level: number
  xp: number
}

export function xpToNext(level: number): number {
  return Math.round(XP.base * Math.pow(XP.growth, level - 1))
}

/** 波末保底经验（随波次缓涨，占总收益的小头） */
export function waveBonusXp(wave: number): number {
  return XP.waveBonusBase + XP.waveBonusPerWave * wave
}

export function gainXp(state: XpState, amount: number): { state: XpState; levelsGained: number } {
  let { level, xp } = state
  xp += amount
  let levelsGained = 0
  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level)
    level++
    levelsGained++
  }
  return { state: { level, xp }, levelsGained }
}

// 经验：等比升级曲线（前快后慢），每升 1 级 = 1 次团队抽卡（见 run/state.ts）。
// 校准目标：每波约 1~1.5 级、前期不超 1.5；加波次/拉长时长也不用动曲线——
// 等比门槛会自然消化更多的总经验
export const XP = {
  base: 80,
  growth: 1.15,
  /** 波末保底经验 = base + perWave×波次：保证杀怪少的短波也有稳定豆收入 */
  waveBonusBase: 40,
  waveBonusPerWave: 36,
} as const
