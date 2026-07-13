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
    expect(loadHighScore(undefined)).toEqual({ bestWave: 0, bestKills: 0 })
    expect(loadHighScore(fakeStorage())).toEqual({ bestWave: 0, bestKills: 0 })
  })

  it('损坏的 JSON 安全降级为零分；旧版 v1 记录被忽略', () => {
    expect(loadHighScore(fakeStorage({ 'warmoji.highscore.v2': '{oops' }))).toEqual({
      bestWave: 0,
      bestKills: 0,
    })
    const v1 = fakeStorage({ 'warmoji.highscore.v1': '{"bestSeconds":60,"bestKills":20}' })
    expect(loadHighScore(v1)).toEqual({ bestWave: 0, bestKills: 0 })
  })

  it('提交成绩后可读回，且识别新纪录（波次优先，平波次比击杀）', () => {
    const s = fakeStorage()
    const first = submitScore(s, 3, 120)
    expect(first.newBest).toBe(true)
    expect(loadHighScore(s)).toEqual({ bestWave: 3, bestKills: 120 })

    const worse = submitScore(s, 2, 50)
    expect(worse.newBest).toBe(false)
    expect(loadHighScore(s)).toEqual({ bestWave: 3, bestKills: 120 })

    const sameWaveMoreKills = submitScore(s, 3, 150)
    expect(sameWaveMoreKills.newBest).toBe(true)

    const deeperWave = submitScore(s, 5, 90)
    expect(deeperWave.newBest).toBe(true)
    expect(loadHighScore(s)).toEqual({ bestWave: 5, bestKills: 150 })
  })

  it('无存储时提交不抛错', () => {
    expect(() => submitScore(undefined, 1, 1)).not.toThrow()
  })
})
