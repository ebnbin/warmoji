import { XP } from '../config'

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
