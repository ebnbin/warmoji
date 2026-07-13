import { describe, expect, it } from 'vitest'
import { MAP, TEAM, UNIT, VIEW } from './config'

describe('单位制锚定', () => {
  it('最小视口长边容纳 20 个单位：1 单位 = 64 逻辑px', () => {
    expect(UNIT).toBe(VIEW.minLong / 20)
    expect(UNIT).toBe(64)
  })

  it('地图 25×25 单位', () => {
    expect(MAP.width).toBe(25 * UNIT)
    expect(MAP.height).toBe(25 * UNIT)
  })

  it('队伍 = 5 名角色，emoji 各不相同', () => {
    expect(TEAM.memberEmojis.length).toBe(TEAM.size)
    expect(new Set(TEAM.memberEmojis).size).toBe(TEAM.size)
  })
})
