import { XP } from '../data/waves'
import type { XpState } from '../types/xp'

/** 从 level 级升到下一级要的经验 */
export function xpToNext(level: number): number {
  return Math.round(XP.base * Math.pow(XP.growth, level - 1))
}

/** 满级了 */
export function xpMaxed(state: XpState): boolean {
  return state.level >= XP.maxLevel
}

/** 攒经验，够了就升级；满级后不再攒 */
export function gainXp(state: XpState, amount: number): { state: XpState; levelsGained: number } {
  let { level, xp } = state
  xp += amount
  let levelsGained = 0
  while (level < XP.maxLevel && xp >= xpToNext(level)) {
    xp -= xpToNext(level)
    level++
    levelsGained++
  }
  return { state: { level, xp: level >= XP.maxLevel ? 0 : xp }, levelsGained }
}
