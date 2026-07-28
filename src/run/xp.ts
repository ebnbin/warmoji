import { XP } from '../data/waves'
import type { XpState } from '../types/xp'

// 队伍经验：击杀 + 波末保底两条腿（短波杀怪少，保底占比更高）。
// 每升 1 级 = 1 次团队升级抽卡（战斗后开卡页三选一，见 cards/registry.ts）。
// 前快后慢的等比曲线，无上限：升级不冻结（无尽模式直接复用这条曲线）。
// 校准目标（15 波制）：第 1 波结束 2~3 级，无经验加成队长通关约 22~24 级。
// 曲线参数表在 data/waves.ts 的 XP（数据行在 defs/progression.ts 的 xp 段）；
// 本文件只留算法——表一律回 data/，见 eslint 的 assets/*.json 护栏。
// 住在 run/ 而不是某套战斗实现里：它动的是 RunState 的跨波进度，两套战斗都只是调一下。

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
