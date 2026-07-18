import { describe, expect, it } from 'vitest'
import { CHARACTERS } from './registry'

describe('花名册', () => {
  it('emoji 不重复，每人有名字、介绍且至少 1 把武器', () => {
    const roster = Object.values(CHARACTERS)
    expect(new Set(roster.map((c) => c.emoji)).size).toBe(roster.length)
    for (const c of roster) {
      expect(c.name.length).toBeGreaterThan(0)
      expect(c.desc.length).toBeGreaterThan(0)
      expect(c.weapons.length).toBeGreaterThan(0)
    }
  })

  it('覆盖全部攻击形态（含新机制型武器）', () => {
    const kinds = Object.values(CHARACTERS).flatMap((c) => c.weapons.map((w) => w.kind))
    expect(new Set(kinds)).toEqual(
      new Set([
        'projectile',
        'thrust',
        'sweep',
        'areaBlast',
        'boomerang',
        'laser',
        'slowAura',
        'assassinate',
        'turret',
        'summon',
        'heal',
        'chainArc',
      ]),
    )
    // 双持：牛仔两把武器；军医 = 治疗 + 保底飞针
    expect(CHARACTERS.cowboy.weapons.length).toBe(2)
    expect(CHARACTERS.medic.weapons.map((w) => w.kind)).toEqual(['heal', 'projectile'])
    // 自体攻击（无持有物）：杂耍者与独角兽
    expect('held' in CHARACTERS.juggler.weapons[0]! && CHARACTERS.juggler.weapons[0].held).toBeFalsy()
    // 仙子的魔尘弹自带变形载荷（新引擎能力的数据入口）
    const bolt = CHARACTERS.fairy.weapons[0]!
    expect(bolt.kind === 'projectile' && bolt.hex?.morphEmoji).toBe('🐑')
  })
})
