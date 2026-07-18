import { describe, expect, it } from 'vitest'
import { RECRUIT, ROSTER_IDS } from './config'
import type { StringStorage } from './storage'
import { drawRecruitPool, recruitSeed, refreshRecruitSeed, unlockAt, unlockedCount } from './recruit'

function memStorage(): StringStorage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  }
}

describe('recruit 种子生命周期', () => {
  it('未初始化（缺失/0/脏数据）时用时间戳初始化并落盘，之后稳定复读', () => {
    const s = memStorage()
    const seed = recruitSeed(s, 'angel')
    expect(seed).toBeGreaterThan(0)
    expect(recruitSeed(s, 'angel')).toBe(seed)
    s.setItem('warmoji.recruit.v1', JSON.stringify({ angel: 0, party: 'oops' }))
    expect(recruitSeed(s, 'angel')).toBeGreaterThan(0)
    expect(recruitSeed(s, 'party')).toBeGreaterThan(0)
  })

  it('各队长种子独立；无存储环境优雅退化；落幕重写为合法种子', () => {
    const s = memStorage()
    recruitSeed(s, 'angel')
    recruitSeed(s, 'party')
    const raw = JSON.parse(s.getItem('warmoji.recruit.v1')!) as Record<string, number>
    expect(Object.keys(raw).sort()).toEqual(['angel', 'party'])
    expect(recruitSeed(undefined, 'angel')).toBeGreaterThan(0)
    refreshRecruitSeed(s, 'angel')
    expect(recruitSeed(s, 'angel')).toBeGreaterThan(0)
  })
})

describe('命定卡池：开局一次抽定', () => {
  it('纯函数：同种子必得同样十张、同样排列；不同种子排列不同', () => {
    const a = drawRecruitPool(123456, ROSTER_IDS)
    const b = drawRecruitPool(123456, ROSTER_IDS)
    const c = drawRecruitPool(654321, ROSTER_IDS)
    expect(a).toEqual(b)
    expect(a).toHaveLength(RECRUIT.poolSize)
    expect(a.join()).not.toBe(c.join())
  })

  it('无重复且都来自花名册；花名册不足时有多少抽多少', () => {
    const pool = drawRecruitPool(42, ROSTER_IDS)
    expect(new Set(pool).size).toBe(pool.length)
    for (const id of pool) expect(ROSTER_IDS).toContain(id)
    expect(drawRecruitPool(42, ROSTER_IDS.slice(0, 3))).toHaveLength(3)
  })
})

describe('命定卡池：按开放编制数解锁', () => {
  it('解锁表：1→4、2→6、3→8、4→9、5→10，越界取末位', () => {
    expect(RECRUIT.unlocks).toEqual([4, 6, 8, 9, 10])
    expect(unlockedCount(1)).toBe(4)
    expect(unlockedCount(2)).toBe(6)
    expect(unlockedCount(3)).toBe(8)
    expect(unlockedCount(4)).toBe(9)
    expect(unlockedCount(5)).toBe(10)
    expect(unlockedCount(6)).toBe(10)
    expect(unlockedCount(0)).toBe(0)
  })

  it('卡位揭晓门槛：前 4 张开局即亮，第 5~6 张要 2 人、第 10 张要 5 人', () => {
    expect(unlockAt(0)).toBe(1)
    expect(unlockAt(3)).toBe(1)
    expect(unlockAt(4)).toBe(2)
    expect(unlockAt(5)).toBe(2)
    expect(unlockAt(6)).toBe(3)
    expect(unlockAt(8)).toBe(4)
    expect(unlockAt(9)).toBe(5)
  })
})
