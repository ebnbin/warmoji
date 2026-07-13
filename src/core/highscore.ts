export interface HighScore {
  bestSeconds: number
  bestKills: number
}

export interface StringStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const KEY = 'warmoji.highscore.v1'
const ZERO: HighScore = { bestSeconds: 0, bestKills: 0 }

/** 隐私模式下访问 localStorage 可能直接抛错，必须包一层。 */
export function browserStorage(): StringStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function loadHighScore(storage: StringStorage | undefined): HighScore {
  if (!storage) return { ...ZERO }
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return { ...ZERO }
    const parsed = JSON.parse(raw) as Partial<HighScore>
    return {
      bestSeconds: typeof parsed.bestSeconds === 'number' ? parsed.bestSeconds : 0,
      bestKills: typeof parsed.bestKills === 'number' ? parsed.bestKills : 0,
    }
  } catch {
    return { ...ZERO }
  }
}

export function submitScore(
  storage: StringStorage | undefined,
  seconds: number,
  kills: number,
): { score: HighScore; newBest: boolean } {
  const prev = loadHighScore(storage)
  const newBest = seconds > prev.bestSeconds || (seconds === prev.bestSeconds && kills > prev.bestKills)
  const score: HighScore = {
    bestSeconds: Math.max(prev.bestSeconds, seconds),
    bestKills: Math.max(prev.bestKills, kills),
  }
  if (storage) {
    try {
      storage.setItem(KEY, JSON.stringify(score))
    } catch {
      // 写入失败（隐私模式/配额）不影响本局结算
    }
  }
  return { score, newBest }
}
