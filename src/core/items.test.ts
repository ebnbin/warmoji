import { describe, expect, it } from 'vitest'
import { CHARACTERS, WEAPONS } from './config'
import {
  aggregateCharacterEffects,
  aggregateTeamEffects,
  captainPool,
  characterPool,
  ITEM_IDS,
  ITEMS,
  reachedStackLimit,
  resolveWeaponSpec,
  rollItem,
} from './items'

describe('道具定义', () => {
  it('每件道具有 emoji/名字/介绍/正价格与至少一条效果', () => {
    for (const id of ITEM_IDS) {
      const item = ITEMS[id]
      expect(item.emoji.length).toBeGreaterThan(0)
      expect(item.name.length).toBeGreaterThan(0)
      expect(item.desc.length).toBeGreaterThan(0)
      expect(item.price).toBeGreaterThan(0)
      expect(Object.keys(item.effects).length).toBeGreaterThan(0)
    }
  })
})

describe('道具池推导', () => {
  it('角色池 = 通用 + 匹配武器形态的专属；不含队长道具', () => {
    const magePool = characterPool(CHARACTERS.mage)
    expect(magePool).toContain('gemHeart')
    expect(magePool).toContain('blastPowder')
    expect(magePool).not.toContain('scope')
    expect(magePool).not.toContain('marchFlag')
    const cowboyPool = characterPool(CHARACTERS.cowboy)
    expect(cowboyPool).toContain('scope')
    expect(cowboyPool).not.toContain('blastPowder')
  })

  it('队长池只含团队道具', () => {
    const pool = captainPool()
    expect(pool.length).toBeGreaterThan(0)
    for (const id of pool) expect(ITEMS[id].pool).toBe('team')
  })

  it('每个角色的池至少有通用道具数量', () => {
    const genericCount = ITEM_IDS.filter((id) => ITEMS[id].pool === 'all').length
    for (const spec of Object.values(CHARACTERS)) {
      expect(characterPool(spec).length).toBeGreaterThanOrEqual(genericCount)
    }
  })
})

describe('堆叠与上架', () => {
  it('达到上限的道具不再上架；全部达上限返回 null', () => {
    expect(reachedStackLimit(['scope'], 'scope')).toBe(false)
    expect(reachedStackLimit(['scope', 'scope'], 'scope')).toBe(true)
    // 无上限道具永不封顶
    expect(reachedStackLimit(Array(50).fill('gemHeart'), 'gemHeart')).toBe(false)
    expect(rollItem(['scope'], ['scope', 'scope'], () => 0)).toBeNull()
    expect(rollItem(['scope', 'gemHeart'], ['scope', 'scope'], () => 0)).toBe('gemHeart')
  })
})

describe('效果叠加', () => {
  it('乘法轴叠乘、加法轴叠加；含负面副作用', () => {
    const fx = aggregateCharacterEffects(['whetstone', 'whetstone', 'rageBracer', 'stimulant'])
    expect(fx.damageMul).toBeCloseTo(1.12 * 1.12 * 1.25)
    expect(fx.cooldownMul).toBeCloseTo(0.87)
    expect(fx.hpAdd).toBe(-30)
  })

  it('团队效果：双倍金币概率加法叠加且封顶', () => {
    const fx = aggregateTeamEffects(['luckyCoin', 'luckyCoin', 'marchFlag', 'heavyArms'])
    expect(fx.doubleCoinChance).toBeCloseTo(0.3)
    expect(fx.moveSpeedMul).toBeCloseTo(1.08 * 0.95)
    expect(fx.teamDamageMul).toBeCloseTo(1.1)
    expect(aggregateTeamEffects(Array(10).fill('luckyCoin')).doubleCoinChance).toBe(0.9)
  })
})

describe('武器参数修正', () => {
  it('rangeMul 缩放空间参数，不动伤害/冷却', () => {
    const fx = { ...aggregateCharacterEffects([]), rangeMul: 1.5 }
    const blast = resolveWeaponSpec(WEAPONS.arcaneBlast, fx)
    if (blast.kind !== 'areaBlast') throw new Error('kind 不变')
    expect(blast.blastRadius).toBeCloseTo(WEAPONS.arcaneBlast.blastRadius * 1.5)
    expect(blast.detectRange).toBeCloseTo(WEAPONS.arcaneBlast.detectRange * 1.5)
    expect(blast.damage).toBe(WEAPONS.arcaneBlast.damage)
    expect(blast.cooldownMs).toBe(WEAPONS.arcaneBlast.cooldownMs)
  })

  it('projSpeedMul 只作用于弹速', () => {
    const fx = { ...aggregateCharacterEffects([]), projSpeedMul: 1.25 }
    const pistol = resolveWeaponSpec(WEAPONS.pistolLeft, fx)
    if (pistol.kind !== 'projectile') throw new Error('kind 不变')
    expect(pistol.projectile.speed).toBeCloseTo(WEAPONS.pistolLeft.projectile.speed * 1.25)
    expect(pistol.projectile.radius).toBe(WEAPONS.pistolLeft.projectile.radius)
  })
})
