import { describe, expect, it } from 'vitest'
import { slotOffset } from './formation'

describe('slotOffset', () => {
  it('0 号槽位在正上方', () => {
    const p = slotOffset(0, 5, 100)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(-100)
  })

  it('全部槽位半径一致且均匀分布（矢量和为零）', () => {
    let sx = 0
    let sy = 0
    for (let i = 0; i < 5; i++) {
      const p = slotOffset(i, 5, 100)
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(100)
      sx += p.x
      sy += p.y
    }
    expect(sx).toBeCloseTo(0)
    expect(sy).toBeCloseTo(0)
  })

  it('槽位两两不重合', () => {
    const pts = Array.from({ length: 5 }, (_, i) => slotOffset(i, 5, 100))
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        expect(Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y)).toBeGreaterThan(1)
      }
    }
  })
})
