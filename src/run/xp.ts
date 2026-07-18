
// 队伍经验：击杀 + 波末保底两条腿（短波杀怪少，保底占比更高）。
// 每升 1 级 = 获得 1 个点数（core/run.ts），用于招募/升级角色，前快后慢的等比曲线。
// 无上限：点数花不出去也继续涨（无尽模式直接复用这条曲线）。
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

// 经验：等比升级曲线（前快后慢），每升 1 级得 1 颗能量豆（见 run/state.ts）。
// 校准目标：每波约 1~1.5 颗豆、前期不超 1.5；满豆冻结所以不必精确，
// 加波次/拉长时长也不用动曲线——等比门槛会自然消化更多的总经验
export const XP = {
  base: 80,
  growth: 1.15,
  /** 波末保底经验 = base + perWave×波次：保证杀怪少的短波也有稳定豆收入 */
  waveBonusBase: 40,
  waveBonusPerWave: 36,
} as const
