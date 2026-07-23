import { describe, expect, it } from 'vitest'
import {
  CHAR_XP_THRESHOLDS,
  MAX_CHAR_LEVEL,
  characterLevel,
  levelProgress,
  tiersForLevel,
} from './charLevel'
import { LEVEL_STATS, levelStatsFor } from '../characters/levels'
import { CHARACTERS } from '../characters/registry'
import type { CharacterId } from '../characters/registry'

const [T1, T2] = CHAR_XP_THRESHOLDS

describe('角色专属经验 → 等级', () => {
  it('阈值分档：不足 T1 为 1 级，达 T1 为 2 级，达 T2 为 3 级（封顶 3）', () => {
    expect(characterLevel(0)).toBe(1)
    expect(characterLevel(T1 - 1)).toBe(1)
    expect(characterLevel(T1)).toBe(2)
    expect(characterLevel(T2 - 1)).toBe(2)
    expect(characterLevel(T2)).toBe(3)
    expect(characterLevel(99999)).toBe(MAX_CHAR_LEVEL)
    expect(MAX_CHAR_LEVEL).toBe(3)
  })

  it('阈值递增（2→3 比 1→2 更贵）', () => {
    expect(T2 - T1).toBeGreaterThan(T1)
  })

  it('tiersForLevel：等级 → 能力档位', () => {
    expect(tiersForLevel(1)).toEqual({ u1: false, u2: false })
    expect(tiersForLevel(2)).toEqual({ u1: true, u2: false })
    expect(tiersForLevel(3)).toEqual({ u1: true, u2: true })
  })
})

describe('levelProgress 进度条数据', () => {
  it('本级内进度：0 → 满', () => {
    const p0 = levelProgress(0)
    expect(p0).toMatchObject({ level: 1, maxed: false, cur: 0, need: T1 })
    expect(p0.ratio).toBe(0)
    const half = levelProgress(Math.floor(T1 / 2))
    expect(half.ratio).toBeCloseTo(0.5, 1)
    const p2 = levelProgress(T1)
    expect(p2).toMatchObject({ level: 2, maxed: false, cur: 0, need: T2 - T1 })
  })

  it('满级：maxed=true、比例 1', () => {
    const p = levelProgress(T2)
    expect(p.maxed).toBe(true)
    expect(p.level).toBe(3)
    expect(p.ratio).toBe(1)
  })
})

describe('角色等级形态基础属性', () => {
  it('每个角色都有 2 档形态；1 级无片段，2/3 级各取对应形态（不叠加）', () => {
    for (const id of Object.keys(CHARACTERS) as CharacterId[]) {
      expect(LEVEL_STATS[id]).toHaveLength(2)
      expect(levelStatsFor(id, 1)).toEqual([])
      expect(levelStatsFor(id, 2)).toEqual([LEVEL_STATS[id][0]])
      expect(levelStatsFor(id, 3)).toEqual([LEVEL_STATS[id][1]])
      // 每档至少一条属性变化
      expect(Object.keys(LEVEL_STATS[id][0]).length).toBeGreaterThan(0)
      expect(Object.keys(LEVEL_STATS[id][1]).length).toBeGreaterThan(0)
    }
  })
})
