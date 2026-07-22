import { describe, expect, it } from 'vitest'
import { clampScroll, maxScrollOf, thumbGeom } from './scroll'

describe('ScrollView 滚动数学', () => {
  it('内容不足视口时不可滚', () => {
    expect(maxScrollOf(300, 500)).toBe(0)
    expect(clampScroll(120, maxScrollOf(300, 500))).toBe(0)
  })

  it('内容超出视口：可滚上限 = 内容高 - 视口高，并钳到 [0,max]', () => {
    const max = maxScrollOf(900, 500)
    expect(max).toBe(400)
    expect(clampScroll(-30, max)).toBe(0)
    expect(clampScroll(250, max)).toBe(250)
    expect(clampScroll(999, max)).toBe(400)
  })

  it('滚动条：内容不足视口无滑块', () => {
    expect(thumbGeom({ x: 0, y: 0, w: 100, h: 500 }, 300, 0)).toBeNull()
  })

  it('滚动条：滑块随滚动线性移动，且不短于最小高', () => {
    const rect = { x: 0, y: 10, w: 100, h: 500 }
    const top = thumbGeom(rect, 2000, 0)!
    const bottom = thumbGeom(rect, 2000, maxScrollOf(2000, rect.h))!
    expect(top.h).toBeGreaterThanOrEqual(24)
    expect(top.y).toBeCloseTo(rect.y, 5)
    // 滚到底：滑块底端贴视口底
    expect(bottom.y + bottom.h).toBeCloseTo(rect.y + rect.h, 5)
    expect(bottom.y).toBeGreaterThan(top.y)
  })
})
