import { describe, expect, it } from 'vitest'
import { MAP, PLAYER, UNIT, VIEW } from './config'

describe('单位制锚定', () => {
  it('最小视口长边容纳 20 个单位：1 单位 = 64 逻辑px', () => {
    expect(UNIT).toBe(VIEW.minLong / 20)
    expect(UNIT).toBe(64)
  })

  it('标准实体（player）尺寸恰为 1 单位', () => {
    expect(PLAYER.size).toBe(UNIT)
  })

  it('地图 25×25 单位', () => {
    expect(MAP.width).toBe(25 * UNIT)
    expect(MAP.height).toBe(25 * UNIT)
  })
})
