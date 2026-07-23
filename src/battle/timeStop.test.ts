import { describe, expect, it } from 'vitest'
import { TIMESTOP, timeScaleFor } from './timeStop'

describe('时停时标映射', () => {
  it('静止=floor、全速=1、单调递增、区间外钳制', () => {
    expect(timeScaleFor(0)).toBeCloseTo(TIMESTOP.floor)
    expect(timeScaleFor(1)).toBeCloseTo(1)
    expect(timeScaleFor(0.5)).toBeGreaterThan(timeScaleFor(0))
    expect(timeScaleFor(0.5)).toBeLessThan(timeScaleFor(1))
    expect(timeScaleFor(-3)).toBeCloseTo(TIMESTOP.floor)
    expect(timeScaleFor(9)).toBeCloseTo(1)
  })

  it('下限为正（静止近乎凝固但不真正卡死）', () => {
    expect(TIMESTOP.floor).toBeGreaterThan(0)
    expect(TIMESTOP.floor).toBeLessThan(0.5)
  })
})
