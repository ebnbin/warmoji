import { describe, expect, it } from 'vitest'
import { computeViewport } from './viewport'

describe('computeViewport', () => {
  it('竖屏 720×1600：1x，逻辑 720×1600（保底上下各扩 160）', () => {
    const v = computeViewport(720, 1600)
    expect(v.fitScale).toBe(1)
    expect(v.logicalWidth).toBe(720)
    expect(v.logicalHeight).toBe(1600)
  })

  it('宽屏 2560×1600：2x，逻辑 1280×800（保底上下各扩 40）', () => {
    const v = computeViewport(2560, 1600)
    expect(v.fitScale).toBe(2)
    expect(v.logicalWidth).toBe(1280)
    expect(v.logicalHeight).toBe(800)
  })

  it('矮宽 1024×720：0.8x，逻辑 1280×900（保底上下各扩 90）', () => {
    const v = computeViewport(1024, 720)
    expect(v.fitScale).toBeCloseTo(0.8)
    expect(v.logicalWidth).toBeCloseTo(1280)
    expect(v.logicalHeight).toBeCloseTo(900)
  })

  it('任意窗口下保底区永不被裁切', () => {
    const cases: Array<[number, number]> = [
      [320, 480],
      [1000, 1000],
      [3440, 1440],
      [500, 2000],
      [1280, 720],
      [720, 1280],
    ]
    for (const [w, h] of cases) {
      const v = computeViewport(w, h)
      const landscape = w >= h
      expect(v.logicalWidth).toBeGreaterThanOrEqual((landscape ? 1280 : 720) - 1e-6)
      expect(v.logicalHeight).toBeGreaterThanOrEqual((landscape ? 720 : 1280) - 1e-6)
    }
  })

  it('方形窗口按横屏处理，逻辑 1280×1280', () => {
    const v = computeViewport(1000, 1000)
    expect(v.logicalWidth).toBeCloseTo(1280)
    expect(v.logicalHeight).toBeCloseTo(1280)
  })
})
