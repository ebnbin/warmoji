import { describe, expect, it } from 'vitest'
import { Rng } from '../core/rng'
import { randomMapPoint } from './spawn'

describe('randomMapPoint', () => {
  it('落点在边缘内缩范围内，且与玩家保持最小距离', () => {
    const rng = new Rng(42)
    const avoid = { x: 800, y: 800 }
    for (let i = 0; i < 500; i++) {
      const p = randomMapPoint(rng, 1600, 1600, 32, avoid, 192)
      expect(p.x).toBeGreaterThanOrEqual(32)
      expect(p.x).toBeLessThanOrEqual(1568)
      expect(p.y).toBeGreaterThanOrEqual(32)
      expect(p.y).toBeLessThanOrEqual(1568)
      expect(Math.hypot(p.x - avoid.x, p.y - avoid.y)).toBeGreaterThanOrEqual(192)
    }
  })

  it('minDist 大到无解时兜底返回界内点，不死循环', () => {
    const rng = new Rng(7)
    const p = randomMapPoint(rng, 1600, 1600, 32, { x: 800, y: 800 }, 99999)
    expect(p.x).toBeGreaterThanOrEqual(32)
    expect(p.x).toBeLessThanOrEqual(1568)
  })

  it('相同种子结果可复现', () => {
    const a = randomMapPoint(new Rng(9), 1600, 1600, 32, { x: 0, y: 0 }, 100)
    const b = randomMapPoint(new Rng(9), 1600, 1600, 32, { x: 0, y: 0 }, 100)
    expect(a).toEqual(b)
  })
})
