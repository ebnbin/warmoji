import { describe, expect, it } from 'vitest'
import { METRO, timeScaleFor } from './metronome'

describe('秒针时标映射', () => {
  it('静止=floor、全速=1、单调递增、区间外钳制', () => {
    expect(timeScaleFor(0)).toBeCloseTo(METRO.floor)
    expect(timeScaleFor(1)).toBeCloseTo(1)
    expect(timeScaleFor(0.5)).toBeGreaterThan(timeScaleFor(0))
    expect(timeScaleFor(0.5)).toBeLessThan(timeScaleFor(1))
    // 越界钳制：负数按 0、>1 按 1
    expect(timeScaleFor(-3)).toBeCloseTo(METRO.floor)
    expect(timeScaleFor(9)).toBeCloseTo(1)
  })

  it('下限为正（永不真正时停，避免卡死且能读盘）', () => {
    expect(METRO.floor).toBeGreaterThan(0)
    expect(METRO.floor).toBeLessThan(0.5)
    expect(timeScaleFor(0)).toBeGreaterThan(0)
  })
})
