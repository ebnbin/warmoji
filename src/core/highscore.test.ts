import { describe, expect, it } from 'vitest'
import { loadHighScore, submitScore } from './highscore'
import type { StringStorage } from './highscore'

function fakeStorage(initial?: Record<string, string>): StringStorage {
  const data = new Map(Object.entries(initial ?? {}))
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v)
    },
  }
}

describe('highscore', () => {
  it('无存储或无记录时返回零分', () => {
    expect(loadHighScore(undefined)).toEqual({ bestSeconds: 0, bestKills: 0 })
    expect(loadHighScore(fakeStorage())).toEqual({ bestSeconds: 0, bestKills: 0 })
  })

  it('损坏的 JSON 安全降级为零分', () => {
    const s = fakeStorage({ 'warmoji.highscore.v1': '{oops' })
    expect(loadHighScore(s)).toEqual({ bestSeconds: 0, bestKills: 0 })
  })

  it('提交成绩后可读回，且识别新纪录', () => {
    const s = fakeStorage()
    const first = submitScore(s, 60, 20)
    expect(first.newBest).toBe(true)
    expect(loadHighScore(s)).toEqual({ bestSeconds: 60, bestKills: 20 })

    const worse = submitScore(s, 30, 5)
    expect(worse.newBest).toBe(false)
    expect(loadHighScore(s)).toEqual({ bestSeconds: 60, bestKills: 20 })

    const better = submitScore(s, 90, 10)
    expect(better.newBest).toBe(true)
    expect(loadHighScore(s)).toEqual({ bestSeconds: 90, bestKills: 20 })
  })

  it('无存储时提交不抛错', () => {
    expect(() => submitScore(undefined, 10, 1)).not.toThrow()
  })
})
