import { describe, expect, it } from 'vitest'
import { UNIT, VIEW } from './units'

describe('单位制锚定', () => {
  it('最小视口长边容纳 20 个单位：1 单位 = 64 逻辑px', () => {
    expect(UNIT).toBe(VIEW.minLong / 20)
    expect(UNIT).toBe(64)
  })
})
