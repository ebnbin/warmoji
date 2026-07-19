import { describe, expect, it } from 'vitest'
import { dist2, norm } from './vec'

describe('vec', () => {
  it('norm 归一化为单位向量', () => {
    expect(norm(3, 4)).toEqual({ x: 0.6, y: 0.8 })
  })

  it('norm 零向量返回 (0,0) 而非 NaN', () => {
    expect(norm(0, 0)).toEqual({ x: 0, y: 0 })
  })

  it('dist2 返回距离平方', () => {
    expect(dist2({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25)
  })
})
