import { StorageKey } from '../util/storage'
import type { StringStorage } from '../util/storage'

export interface HighScore {
  bestWave: number
  bestKills: number
}

const ZERO: HighScore = { bestWave: 0, bestKills: 0 }

export function loadHighScore(storage: StringStorage | undefined): HighScore {
  if (!storage) return { ...ZERO }
  try {
    const raw = storage.getItem(StorageKey.Highscore)
    if (!raw) return { ...ZERO }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...ZERO }
    return {
      bestWave: 'bestWave' in parsed && typeof parsed.bestWave === 'number' ? parsed.bestWave : 0,
      bestKills: 'bestKills' in parsed && typeof parsed.bestKills === 'number' ? parsed.bestKills : 0,
    }
  } catch {
    return { ...ZERO }
  }
}

export function submitScore(
  storage: StringStorage | undefined,
  wave: number,
  kills: number,
): { score: HighScore; newBest: boolean } {
  const prev = loadHighScore(storage)
  const newBest = wave > prev.bestWave || (wave === prev.bestWave && kills > prev.bestKills)
  const score: HighScore = {
    bestWave: Math.max(prev.bestWave, wave),
    bestKills: Math.max(prev.bestKills, kills),
  }
  if (storage) {
    try {
      storage.setItem(StorageKey.Highscore, JSON.stringify(score))
    } catch {
    }
  }
  return { score, newBest }
}
