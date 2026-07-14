import { describe, expect, it } from 'vitest'
import { CAPTAIN_IDS, CAPTAINS, ROSTER_IDS } from './config'
import type { StringStorage } from './highscore'
import {
  loadCaptain,
  loadLineup,
  loadTeam,
  sanitizeCaptain,
  sanitizeLineup,
  saveCaptain,
  saveLineup,
  toggleLineup,
} from './selection'

function memStorage(): StringStorage {
  const data = new Map<string, string>()
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  }
}

const SIZE = 5
const DEFAULT = ROSTER_IDS.slice(0, SIZE)

describe('队长选择', () => {
  it('非法/缺失回退默认队长；读写往返', () => {
    expect(sanitizeCaptain(undefined)).toBe(CAPTAIN_IDS[0])
    expect(sanitizeCaptain('nope')).toBe(CAPTAIN_IDS[0])
    const s = memStorage()
    saveCaptain(s, 'party')
    expect(loadCaptain(s)).toBe('party')
    expect(loadCaptain(undefined)).toBe(CAPTAIN_IDS[0])
  })

  it('花名册人数满足所有队长的编制需求', () => {
    for (const c of Object.values(CAPTAINS)) {
      expect(ROSTER_IDS.length).toBeGreaterThanOrEqual(c.teamSize)
    }
  })
})

describe('出战阵容选择', () => {
  it('空/非法数据回退默认阵容', () => {
    expect(sanitizeLineup(undefined, SIZE)).toEqual(DEFAULT)
    expect(sanitizeLineup('mage', SIZE)).toEqual(DEFAULT)
    expect(sanitizeLineup(['nope', 42], SIZE)).toEqual(DEFAULT)
  })

  it('合法子集保留（允许未选满），去重并按编制截断', () => {
    expect(sanitizeLineup(['mage', 'mage', 'troll'], SIZE)).toEqual(['mage', 'troll'])
    expect(sanitizeLineup([...ROSTER_IDS], SIZE)).toEqual(DEFAULT)
    expect(sanitizeLineup([...ROSTER_IDS], 6)).toEqual(ROSTER_IDS.slice(0, 6))
  })

  it('toggle：已选则移除，未满则追加，满员时替换最早选入的', () => {
    const benched = ROSTER_IDS[SIZE]!
    expect(toggleLineup(DEFAULT, benched, SIZE)).toEqual([...DEFAULT.slice(1), benched])
    expect(toggleLineup(DEFAULT, benched, 6)).toEqual([...DEFAULT, benched])
    const four = toggleLineup(DEFAULT, DEFAULT[0]!, SIZE)
    expect(four).toHaveLength(SIZE - 1)
    expect(toggleLineup(four, benched, SIZE)).toEqual([...four, benched])
    // 首发单选场景：点谁换谁
    expect(toggleLineup(['cowboy'], 'mage', 1)).toEqual(['mage'])
    expect(toggleLineup(['cowboy'], 'cowboy', 1)).toEqual([])
  })

  it('存储读写往返；坏数据与无存储都回退默认', () => {
    const s = memStorage()
    saveLineup(s, ['mage', 'kangaroo'])
    expect(loadLineup(s, SIZE)).toEqual(['mage', 'kangaroo'])
    expect(loadLineup(undefined, SIZE)).toEqual(DEFAULT)
    s.setItem('warmoji.lineup.v1', '{bad json')
    expect(loadLineup(s, SIZE)).toEqual(DEFAULT)
  })

  it('loadTeam：首发人数 = 队长开局等级（点数）', () => {
    const s = memStorage()
    saveCaptain(s, 'prodigy')
    saveLineup(s, [...ROSTER_IDS])
    expect(loadTeam(s).lineup).toHaveLength(CAPTAINS.prodigy.startLevel)
    saveCaptain(s, 'angel')
    expect(loadTeam(s).lineup).toHaveLength(CAPTAINS.angel.startLevel)
  })
})
