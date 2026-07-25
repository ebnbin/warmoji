import { describe, expect, it } from 'vitest'
import { approach, onFloe } from './ice'

describe('浮冰边界判定 onFloe', () => {
  const F = 100 // floePx
  it('冰面内为真', () => {
    expect(onFloe(50, 50, F)).toBe(true)
    expect(onFloe(0, 0, F)).toBe(true)
    expect(onFloe(100, 100, F)).toBe(true)
  })
  it('出界即落水（四向）', () => {
    expect(onFloe(-1, 50, F)).toBe(false)
    expect(onFloe(101, 50, F)).toBe(false)
    expect(onFloe(50, -1, F)).toBe(false)
    expect(onFloe(50, 101, F)).toBe(false)
  })
})

describe('打滑低通 approach', () => {
  it('dt→0 几乎不变（起步慢）', () => {
    expect(approach(0, 100, 0.0001, 0.5)).toBeCloseTo(0, 1)
  })
  it('dt 相对 tau 很大时趋近目标（终将到位）', () => {
    expect(approach(0, 100, 5, 0.5)).toBeCloseTo(100, 1)
  })
  it('tau 越大越滑：同 dt 下改变越小', () => {
    const slippery = approach(0, 100, 0.1, 1.0) // 大 tau
    const grippy = approach(0, 100, 0.1, 0.1) // 小 tau
    expect(slippery).toBeLessThan(grippy)
  })
  it('松手（目标 0）时按 tau 滑行衰减，不瞬停', () => {
    const v = approach(200, 0, 0.1, 0.5)
    expect(v).toBeGreaterThan(0) // 还在滑
    expect(v).toBeLessThan(200) // 但在减速
  })
  it('tau≤0 视为瞬间跟手（无打滑）', () => {
    expect(approach(0, 100, 0.016, 0)).toBe(100)
  })
})
