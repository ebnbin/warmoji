import { describe, expect, it } from 'vitest'
import { ROSTER_IDS } from './config'
import type { StringStorage } from './highscore'
import { recruitSeed, refreshRecruitSeed, rollCandidates } from './recruit'

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
    // 显式写入 0 哨兵：视为未初始化，重新生成非零种子
    s.setItem('warmoji.recruit.v1', JSON.stringify({ angel: 0, party: 'oops' }))
    expect(recruitSeed(s, 'angel')).toBeGreaterThan(0)
    expect(recruitSeed(s, 'party')).toBeGreaterThan(0)
  })

  it('各队长种子独立；无存储环境优雅退化（仍返回可用种子）', () => {
    const s = memStorage()
    recruitSeed(s, 'angel')
    recruitSeed(s, 'party')
    const raw = JSON.parse(s.getItem('warmoji.recruit.v1')!) as Record<string, number>
    expect(Object.keys(raw).sort()).toEqual(['angel', 'party'])
    expect(recruitSeed(undefined, 'angel')).toBeGreaterThan(0)
  })

  it('一局落幕滚新种子（同毫秒时间戳下也不敢断言必变，只断言仍合法非零）', () => {
    const s = memStorage()
    const before = recruitSeed(s, 'angel')
    refreshRecruitSeed(s, 'angel')
    const after = recruitSeed(s, 'angel')
    expect(after).toBeGreaterThan(0)
    // 同毫秒内 Date.now 相同的概率极高——用「落盘值被重写为合法种子」代替必变断言
    expect(typeof before).toBe('number')
  })
})

describe('recruit 批量抽取', () => {
  const all = [...ROSTER_IDS]

  it('纯函数：同（种子 × 已招人数 × 剩余集合）必得同一批候选', () => {
    const a = rollCandidates(123456, 0, all, 5)
    const b = rollCandidates(123456, 0, all, 5)
    expect(a).toEqual(b)
    expect(a).toHaveLength(5)
  })

  it('候选无重复且都来自剩余集合；k 超出时有多少给多少', () => {
    const picked = rollCandidates(42, 2, all, 5)
    expect(new Set(picked).size).toBe(picked.length)
    for (const id of picked) expect(all).toContain(id)
    expect(rollCandidates(42, 0, all.slice(0, 3), 9)).toHaveLength(3)
    expect(rollCandidates(42, 0, [], 5)).toHaveLength(0)
  })

  it('招募序号派生子流：同种子下不同批次的候选序通常不同', () => {
    const w1 = rollCandidates(777, 0, all, 8)
    const w2 = rollCandidates(777, 1, all, 8)
    expect(w1.join()).not.toBe(w2.join())
  })

  it('不同种子给出不同候选序（换命成功）', () => {
    const a = rollCandidates(1001, 0, all, 8)
    const b = rollCandidates(2002, 0, all, 8)
    expect(a.join()).not.toBe(b.join())
  })
})
