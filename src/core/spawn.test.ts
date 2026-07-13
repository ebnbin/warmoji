import { describe, expect, it } from 'vitest'
import { Rng } from './rng'
import { edgeSpawnPoint } from './spawn'

describe('edgeSpawnPoint', () => {
  it('生成点全部在矩形之外、外扩圈之内，且四边都会出现', () => {
    const rng = new Rng(123)
    const view = { x: 100, y: 200, width: 800, height: 600 }
    const outset = 50
    const sides = new Set<string>()
    for (let i = 0; i < 500; i++) {
      const p = edgeSpawnPoint(rng, view, outset)
      const insideView =
        p.x > view.x && p.x < view.x + view.width && p.y > view.y && p.y < view.y + view.height
      expect(insideView).toBe(false)
      expect(p.x).toBeGreaterThanOrEqual(view.x - outset)
      expect(p.x).toBeLessThanOrEqual(view.x + view.width + outset)
      expect(p.y).toBeGreaterThanOrEqual(view.y - outset)
      expect(p.y).toBeLessThanOrEqual(view.y + view.height + outset)
      if (p.y === Math.round(view.y - outset)) sides.add('top')
      if (p.y === Math.round(view.y + view.height + outset)) sides.add('bottom')
      if (p.x === Math.round(view.x - outset)) sides.add('left')
      if (p.x === Math.round(view.x + view.width + outset)) sides.add('right')
    }
    expect(sides.size).toBe(4)
  })
})
