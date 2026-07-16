import { describe, expect, it } from 'vitest'
import { ABILITIES, ABILITY_LEVELS, applyAbilities, unlockedAbilities } from './abilities'
import { CHARACTERS } from './config'
import type { CharacterId } from './config'

const IDS = Object.keys(CHARACTERS) as CharacterId[]

describe('特殊能力定义', () => {
  it('每个角色恰好两个能力（3/6 级），均有图标/名字/描述', () => {
    expect(ABILITY_LEVELS).toEqual([3, 6])
    for (const id of IDS) {
      expect(ABILITIES[id]).toHaveLength(2)
      for (const a of ABILITIES[id]) {
        expect(a.icon.length).toBeGreaterThan(0)
        expect(a.name.length).toBeGreaterThan(0)
        expect(a.desc.length).toBeGreaterThan(0)
      }
    }
  })

  it('解锁进度：2 级无、3 级一个、6 级两个', () => {
    for (const id of IDS) {
      expect(unlockedAbilities(id, 2)).toHaveLength(0)
      expect(unlockedAbilities(id, 3)).toHaveLength(1)
      expect(unlockedAbilities(id, 5)).toHaveLength(1)
      expect(unlockedAbilities(id, 6)).toHaveLength(2)
    }
  })
})

describe('能力注入武器 spec', () => {
  it('3 级前不改动任何武器', () => {
    for (const id of IDS) {
      const out = applyAbilities(id, 2, CHARACTERS[id].weapons)
      expect(out).toEqual([...CHARACTERS[id].weapons])
    }
  })

  it('每个角色 3 级起武器 spec 发生实际变化', () => {
    for (const id of IDS) {
      const out = applyAbilities(id, 3, CHARACTERS[id].weapons)
      expect(out).not.toEqual([...CHARACTERS[id].weapons])
    }
  })

  it('杂耍演员：3 级齐射、6 级追加溅射', () => {
    const [w3] = applyAbilities('juggler', 3, CHARACTERS.juggler.weapons)
    if (w3?.kind !== 'projectile') throw new Error('kind 不变')
    expect(w3.volley?.count).toBe(3)
    expect(w3.splash).toBeUndefined()
    const [w6] = applyAbilities('juggler', 6, CHARACTERS.juggler.weapons)
    if (w6?.kind !== 'projectile') throw new Error('kind 不变')
    expect(w6.volley?.count).toBe(3)
    expect(w6.splash?.ratio).toBeCloseTo(0.6)
  })

  it('巨魔：3 级弧宽变整圈；牛仔双枪都获得贯穿', () => {
    const [sweep] = applyAbilities('troll', 3, CHARACTERS.troll.weapons)
    if (sweep?.kind !== 'sweep') throw new Error('kind 不变')
    expect(sweep.arcRad).toBeCloseTo(Math.PI * 2)
    const pistols = applyAbilities('cowboy', 3, CHARACTERS.cowboy.weapons)
    expect(pistols).toHaveLength(2)
    for (const p of pistols) {
      if (p.kind !== 'projectile') throw new Error('kind 不变')
      expect(p.pierce).toBe(2)
    }
  })

  it('袋鼠 6 级：镖体与判定同步放大且带磁力', () => {
    const [b3] = applyAbilities('kangaroo', 3, CHARACTERS.kangaroo.weapons)
    const [b6] = applyAbilities('kangaroo', 6, CHARACTERS.kangaroo.weapons)
    if (b3?.kind !== 'boomerang' || b6?.kind !== 'boomerang') throw new Error('kind 不变')
    expect(b3.twin).toBe(true)
    expect(b3.coinMagnetRadius).toBeUndefined()
    expect(b6.hitRadius).toBeCloseTo(b3.hitRadius * 1.4)
    expect(b6.held.size).toBeCloseTo(b3.held.size * 1.4)
    expect(b6.coinMagnetRadius).toBeGreaterThan(0)
  })

  it('雪人：3 级冻伤 dps、6 级追加冰冻脉冲；机器人 6 级扫射取代单束', () => {
    const [aura] = applyAbilities('snowman', 6, CHARACTERS.snowman.weapons)
    if (aura?.kind !== 'slowAura') throw new Error('kind 不变')
    expect(aura.dps).toBeGreaterThan(0)
    expect(aura.freeze?.durationMs).toBeGreaterThan(0)
    const [laser] = applyAbilities('robot', 6, CHARACTERS.robot.weapons)
    if (laser?.kind !== 'laser') throw new Error('kind 不变')
    expect(laser.radial?.beams).toBe(8)
  })
})
