import { XP } from './config'

export interface XpState {
  level: number
  xp: number
}

export function xpToNext(level: number): number {
  return XP.base + XP.perLevel * (level - 1)
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
