import { XP } from '../data/waves'
import type { XpState } from '../types/xp'

export function xpToNext(level: number): number {
  return Math.round(XP.base * Math.pow(XP.growth, level - 1))
}

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
