import { describe, expect, it } from 'vitest'
import { CAPTAIN_IDS } from './config'
import type { StringStorage } from './highscore'
import { MAP_IDS } from './maps'
import { loadCaptain, loadMap, sanitizeCaptain, saveCaptain, saveMap } from './selection'

function memStorage(): StringStorage {
  const data = new Map<string, string>()
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  }
}

describe('队长选择', () => {
  it('非法/缺失回退默认队长；读写往返', () => {
    expect(sanitizeCaptain(undefined)).toBe(CAPTAIN_IDS[0])
    expect(sanitizeCaptain('nope')).toBe(CAPTAIN_IDS[0])
    const s = memStorage()
    expect(loadCaptain(s)).toBe(CAPTAIN_IDS[0])
    saveCaptain(s, 'prodigy')
    expect(loadCaptain(s)).toBe('prodigy')
  })

  it('无存储时安全回退', () => {
    expect(loadCaptain(undefined)).toBe(CAPTAIN_IDS[0])
    saveCaptain(undefined, 'angel')
  })
})

describe('地图选择', () => {
  it('非法/缺失回退首图；读写往返；与队长键互不干扰', () => {
    const s = memStorage()
    expect(loadMap(s)).toBe(MAP_IDS[0])
    saveMap(s, 'snow')
    expect(loadMap(s)).toBe('snow')
    saveCaptain(s, 'prodigy')
    expect(loadMap(s)).toBe('snow')
    expect(loadMap(undefined)).toBe(MAP_IDS[0])
    saveMap(undefined, 'desert')
  })
})
