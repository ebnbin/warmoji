import { describe, expect, it } from 'vitest'
import { ROSTER_IDS, TEAM } from './config'
import type { StringStorage } from './highscore'
import { loadLineup, sanitizeLineup, saveLineup, toggleLineup } from './selection'

function memStorage(): StringStorage {
  const data = new Map<string, string>()
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  }
}

const DEFAULT = ROSTER_IDS.slice(0, TEAM.size)

describe('出战阵容选择', () => {
  it('花名册人数足够组满一队', () => {
    expect(ROSTER_IDS.length).toBeGreaterThanOrEqual(TEAM.size)
  })

  it('空/非法数据回退默认阵容', () => {
    expect(sanitizeLineup(undefined)).toEqual(DEFAULT)
    expect(sanitizeLineup('mage')).toEqual(DEFAULT)
    expect(sanitizeLineup(['nope', 42])).toEqual(DEFAULT)
  })

  it('合法子集保留（允许未选满），去重并截断到上限', () => {
    expect(sanitizeLineup(['mage', 'mage', 'troll'])).toEqual(['mage', 'troll'])
    expect(sanitizeLineup([...ROSTER_IDS])).toEqual(DEFAULT)
  })

  it('toggle：已选则移除，未满则追加，满员时忽略新增', () => {
    const benched = ROSTER_IDS[TEAM.size]!
    expect(toggleLineup(DEFAULT, benched)).toEqual(DEFAULT)
    const four = toggleLineup(DEFAULT, DEFAULT[0]!)
    expect(four).toHaveLength(TEAM.size - 1)
    expect(four).not.toContain(DEFAULT[0])
    expect(toggleLineup(four, benched)).toEqual([...four, benched])
  })

  it('存储读写往返；坏数据与无存储都回退默认', () => {
    const s = memStorage()
    saveLineup(s, ['mage', 'kangaroo'])
    expect(loadLineup(s)).toEqual(['mage', 'kangaroo'])
    expect(loadLineup(undefined)).toEqual(DEFAULT)
    s.setItem('warmoji.lineup.v1', '{bad json')
    expect(loadLineup(s)).toEqual(DEFAULT)
  })
})
