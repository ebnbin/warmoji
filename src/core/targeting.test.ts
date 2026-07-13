import { describe, expect, it } from 'vitest'
import { nearestIndex } from './targeting'

describe('nearestIndex', () => {
  it('返回最近点的下标', () => {
    const points = [
      { x: 10, y: 0 },
      { x: 3, y: 4 },
      { x: -100, y: 0 },
    ]
    expect(nearestIndex({ x: 0, y: 0 }, points)).toBe(1)
  })

  it('空数组返回 -1', () => {
    expect(nearestIndex({ x: 0, y: 0 }, [])).toBe(-1)
  })

  it('距离相同取靠前者', () => {
    const points = [
      { x: 5, y: 0 },
      { x: -5, y: 0 },
    ]
    expect(nearestIndex({ x: 0, y: 0 }, points)).toBe(0)
  })
})
