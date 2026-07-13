import { XP } from './config'

export interface XpState {
  level: number
  xp: number
}

/** 从 level 升到 level+1 所需经验。 */
export function xpToNext(level: number): number {
  return XP.base + XP.perLevel * (level - 1)
}

/** 获得经验，可能连升多级；返回新状态与本次升级数。 */
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
