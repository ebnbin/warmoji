import { describe, expect, it } from 'vitest'
import { hslToInt, randomPalette } from './palette'
import { Rng } from './rng'

describe('hslToInt', () => {
  it('基准色正确', () => {
    expect(hslToInt(0, 1, 0.5)).toBe(0xff0000)
    expect(hslToInt(120, 1, 0.5)).toBe(0x00ff00)
    expect(hslToInt(240, 1, 0.5)).toBe(0x0000ff)
    expect(hslToInt(0, 0, 0.5)).toBe(0x808080)
    expect(hslToInt(0, 0, 1)).toBe(0xffffff)
    expect(hslToInt(0, 0, 0)).toBe(0x000000)
  })

  it('色相取模与负值安全', () => {
    expect(hslToInt(360, 1, 0.5)).toBe(hslToInt(0, 1, 0.5))
    expect(hslToInt(-120, 1, 0.5)).toBe(hslToInt(240, 1, 0.5))
  })
})

describe('randomPalette', () => {
  it('相同种子产生相同配色（可复现）', () => {
    expect(randomPalette(new Rng(7))).toEqual(randomPalette(new Rng(7)))
  })

  it('背景为固定中性色 #292f33，地图为 24 位数值色', () => {
    const p = randomPalette(new Rng(42))
    expect(p.bgFrom).toBe('#292f33')
    expect(p.bgTo).toBe('#292f33')
    expect(p.map).toBeGreaterThanOrEqual(0)
    expect(p.map).toBeLessThanOrEqual(0xffffff)
  })
})
