import { describe, expect, it } from 'vitest'
import { Rng } from './rng'

describe('Rng', () => {
  it('相同种子产生相同序列', () => {
    const a = new Rng(42)
    const b = new Rng(42)
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(
      Array.from({ length: 20 }, () => b.next()),
    )
  })

  it('不同种子产生不同序列', () => {
    const a = new Rng(1)
    const b = new Rng(2)
    expect(Array.from({ length: 20 }, () => a.next())).not.toEqual(
      Array.from({ length: 20 }, () => b.next()),
    )
  })

  it('next 始终落在 [0, 1)', () => {
    const rng = new Rng(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('int 不越界且能覆盖闭区间两端', () => {
    const rng = new Rng(7)
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(1, 3)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(3)
      seen.add(v)
    }
    expect(seen).toEqual(new Set([1, 2, 3]))
  })

  it('pick 返回数组内元素，空数组抛错', () => {
    const rng = new Rng(9)
    const items = ['a', 'b', 'c'] as const
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(rng.pick(items))
    }
    expect(() => rng.pick([])).toThrow()
  })
})
