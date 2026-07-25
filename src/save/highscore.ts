import type { StringStorage } from '../util/storage'

export interface HighScore {
  bestWave: number
  bestKills: number
}

// v1 记录的是存活秒数，波次制后语义失效，直接换 key 弃旧
const KEY = 'warmoji.highscore.v2'
const ZERO: HighScore = { bestWave: 0, bestKills: 0 }

export function loadHighScore(storage: StringStorage | undefined): HighScore {
  if (!storage) return { ...ZERO }
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return { ...ZERO }
    const parsed = JSON.parse(raw) as Partial<HighScore>
    return {
      bestWave: typeof parsed.bestWave === 'number' ? parsed.bestWave : 0,
      bestKills: typeof parsed.bestKills === 'number' ? parsed.bestKills : 0,
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
      storage.setItem(KEY, JSON.stringify(score))
    } catch {
      // 隐私模式/配额写入失败可忽略
    }
  }
  return { score, newBest }
}
