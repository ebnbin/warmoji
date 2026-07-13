import { describe, expect, it } from 'vitest'
import { CHARACTERS, MAP, TEAM, UNIT, VIEW } from './config'

describe('单位制锚定', () => {
  it('最小视口长边容纳 20 个单位：1 单位 = 64 逻辑px', () => {
    expect(UNIT).toBe(VIEW.minLong / 20)
    expect(UNIT).toBe(64)
  })

  it('地图 25×25 单位', () => {
    expect(MAP.width).toBe(25 * UNIT)
    expect(MAP.height).toBe(25 * UNIT)
  })

  it('阵容角色 emoji 各不相同，每人至少配置 1 把武器', () => {
    expect(new Set(TEAM.lineup.map((c) => c.emoji)).size).toBe(TEAM.lineup.length)
    for (const c of TEAM.lineup) expect(c.weapons.length).toBeGreaterThan(0)
  })

  it('花名册覆盖六种攻击形态', () => {
    const kinds = Object.values(CHARACTERS).flatMap((c) => c.weapons.map((w) => w.kind))
    expect(new Set(kinds)).toEqual(new Set(['projectile', 'thrust', 'sweep', 'areaBlast', 'boomerang']))
    // 双持：牛仔两把武器
    expect(CHARACTERS.cowboy.weapons.length).toBe(2)
    // 自体攻击（无持有物）：杂耍者与独角兽
    expect('held' in CHARACTERS.juggler.weapons[0]! && CHARACTERS.juggler.weapons[0].held).toBeFalsy()
  })
})
