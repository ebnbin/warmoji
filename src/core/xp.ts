import { XP } from './config'

// 队伍经验：击杀 + 波末保底两条腿（短波杀怪少，保底占比更高）。
// 每升 1 级 = 获得 1 个点数（core/run.ts），用于招募/升级角色，前快后慢的等比曲线
// 校准目标（15 波制）：第 1 波结束 2~3 级，第 15 波打完约到 18 级封顶。

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
  // 满级封顶：不再获得任何经验
  if (state.level >= XP.maxLevel) return { state, levelsGained: 0 }
  let { level, xp } = state
  xp += amount
  let levelsGained = 0
  while (xp >= xpToNext(level) && level < XP.maxLevel) {
    xp -= xpToNext(level)
    level++
    levelsGained++
  }
  // 恰好到顶时清空余量，经验条不再有意义
  if (level >= XP.maxLevel) xp = 0
  return { state: { level, xp }, levelsGained }
}
