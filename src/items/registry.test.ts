import { describe, expect, it } from 'vitest'
import { CHARACTERS } from '../characters/registry'
import { ABILITIES } from '../abilities/registry'
import type { ItemRarity } from './registry'
import {
  itemPrice,
  PRICE,
  aggregateCharacterEffects,
  characterPoolFor,
  ITEM_IDS,
  ITEMS,
  RARITY_ORDER,
  rarityWeights,
  reachedStackLimit,
  resolveAbilityDef,
  rollItem,
} from './registry'

describe('道具定义', () => {
  it('每件道具有 emoji/名字/介绍/正价格/正经验值/至少一条效果', () => {
    for (const id of ITEM_IDS) {
      const item = ITEMS[id]
      expect(item.emoji.length).toBeGreaterThan(0)
      expect(item.name.length).toBeGreaterThan(0)
      expect(item.desc.length).toBeGreaterThan(0)
      expect(item.price).toBeGreaterThan(0)
      expect(item.upgradeXp).toBeGreaterThan(0)
      expect(Object.keys(item.effects).length).toBeGreaterThan(0)
    }
  })

  it('经验值与稀有度松相关：史诗均值 > 稀有均值 > 普通均值', () => {
    const avg = (r: ItemRarity): number => {
      const xs = ITEM_IDS.filter((id) => ITEMS[id].rarity === r).map((id) => ITEMS[id].upgradeXp)
      return xs.reduce((a, b) => a + b, 0) / xs.length
    }
    expect(avg('common')).toBeLessThan(avg('rare'))
    expect(avg('rare')).toBeLessThan(avg('epic'))
  })
})

describe('稀有度', () => {
  const prices = (r: ItemRarity): number[] =>
    ITEM_IDS.filter((id) => ITEMS[id].rarity === r).map((id) => ITEMS[id].price)

  it('三档都有道具；价格档严格递增（最贵普通 < 最便宜稀有 < ... 史诗）', () => {
    for (const r of RARITY_ORDER) expect(prices(r).length).toBeGreaterThan(0)
    expect(Math.max(...prices('common'))).toBeLessThan(Math.min(...prices('rare')))
    expect(Math.max(...prices('rare'))).toBeLessThan(Math.min(...prices('epic')))
  })

  it('稀有及以上道具都有堆叠上限（大件不允许无限堆）', () => {
    for (const id of ITEM_IDS) {
      if (ITEMS[id].rarity !== 'common') expect(ITEMS[id].maxStacks).toBeDefined()
    }
  })

  it('权重非负；史诗常规第 5 波前为 0；角色等级独立抬升稀有/史诗（2 级即便早波也解锁史诗）', () => {
    for (let w = 1; w <= 15; w++) {
      for (let lv = 1; lv <= 3; lv++) {
        const wt = rarityWeights(w, lv)
        expect(Math.min(wt.common, wt.rare, wt.epic)).toBeGreaterThanOrEqual(0)
      }
    }
    // 1 级：史诗随波次解锁
    expect(rarityWeights(1, 1).epic).toBe(0)
    expect(rarityWeights(4, 1).epic).toBe(0)
    expect(rarityWeights(5, 1).epic).toBeGreaterThan(0)
    // 等级独立解锁：2 级角色第 1 波就能刷史诗，且稀有权重随等级抬升
    expect(rarityWeights(1, 2).epic).toBeGreaterThan(0)
    expect(rarityWeights(1, 3).epic).toBeGreaterThan(rarityWeights(1, 2).epic)
    expect(rarityWeights(6, 3).rare).toBeGreaterThan(rarityWeights(6, 1).rare)
  })

  it('第 1 波（1 级）抽不到史诗；后期高随机数落入史诗档', () => {
    const pool = ['gemHeart', 'fateDice'] as const
    expect(rollItem([...pool], [], () => 0.99, 1, 1)).toBe('gemHeart')
    expect(rollItem([...pool], [], () => 0.99, 15, 1)).toBe('fateDice')
  })

  it('空档权重归拢：池里只剩史诗而史诗未解锁时仍可上架（兜底不空货）', () => {
    expect(rollItem(['fateDice'], [], () => 0.99, 1, 1)).toBe('fateDice')
  })
})

describe('道具池推导（每等级独立）', () => {
  it('角色池 = 通用 + 匹配能力形态；不含不匹配的形态道具；minLevel 高端货按等级解锁', () => {
    const mage1 = characterPoolFor(CHARACTERS.mage, 1)
    expect(mage1).toContain('gemHeart')
    expect(mage1).toContain('blastPowder')
    expect(mage1).not.toContain('scope')
    // fateDice minLevel 2、giantHeart minLevel 3：1 级不上架
    expect(mage1).not.toContain('fateDice')
    expect(mage1).not.toContain('giantHeart')
    expect(characterPoolFor(CHARACTERS.mage, 2)).toContain('fateDice')
    expect(characterPoolFor(CHARACTERS.mage, 3)).toContain('giantHeart')
    const cowboy1 = characterPoolFor(CHARACTERS.cowboy, 1)
    expect(cowboy1).toContain('scope')
    expect(cowboy1).not.toContain('blastPowder')
  })

  it('每个角色 1 级池至少含 1 级可上架的通用道具数', () => {
    const genericL1 = ITEM_IDS.filter(
      (id) => ITEMS[id].pool === 'all' && (ITEMS[id].minLevel ?? 1) <= 1,
    ).length
    for (const def of Object.values(CHARACTERS)) {
      expect(characterPoolFor(def, 1).length).toBeGreaterThanOrEqual(genericL1)
    }
  })
})

describe('堆叠与上架', () => {
  it('达到上限的道具不再上架；全部达上限返回 null', () => {
    expect(reachedStackLimit(['scope'], 'scope')).toBe(false)
    expect(reachedStackLimit(['scope', 'scope'], 'scope')).toBe(true)
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

  it('extra 片段（角色等级形态基础质变）与道具走同一叠加管线', () => {
    const fx = aggregateCharacterEffects(['whetstone'], [{ damageMul: 1.5, hpAdd: 40 }])
    expect(fx.damageMul).toBeCloseTo(1.12 * 1.5)
    expect(fx.hpAdd).toBe(40)
  })

  it('新角色轴：回复/反伤/击杀回血加法叠加，暴击封顶 0.5，击退叠乘', () => {
    const fx = aggregateCharacterEffects([
      'regenRing',
      'regenRing',
      'thornVest',
      'vampFang',
      'fateDice',
      'fateDice',
      'hammerWeight',
    ])
    expect(fx.regenPerSec).toBe(4)
    expect(fx.thorns).toBe(14)
    expect(fx.killHeal).toBe(3)
    expect(fx.critChance).toBeCloseTo(0.4)
    expect(fx.knockbackMul).toBeCloseTo(1.35)
    expect(aggregateCharacterEffects(Array(5).fill('fateDice')).critChance).toBe(0.5)
  })
})

describe('能力参数修正', () => {
  it('rangeMul 缩放空间参数，不动伤害/冷却', () => {
    const fx = { ...aggregateCharacterEffects([]), rangeMul: 1.5 }
    const base = ABILITIES.arcaneBlast
    if (base.kind !== 'areaBlast') throw new Error('kind 不变')
    const blast = resolveAbilityDef(base, fx)
    if (blast.kind !== 'areaBlast') throw new Error('kind 不变')
    expect(blast.blastRadius).toBeCloseTo(base.blastRadius * 1.5)
    expect(blast.detectRange).toBeCloseTo(base.detectRange * 1.5)
    expect(blast.damage).toBe(base.damage)
    expect(blast.cooldownMs).toBe(base.cooldownMs)
  })

  it('projSpeedMul 只作用于弹速', () => {
    const fx = { ...aggregateCharacterEffects([]), projSpeedMul: 1.25 }
    const base = ABILITIES.pistolLeft
    if (base.kind !== 'projectile') throw new Error('kind 不变')
    const pistol = resolveAbilityDef(base, fx)
    if (pistol.kind !== 'projectile') throw new Error('kind 不变')
    expect(pistol.projectile.speed).toBeCloseTo(base.projectile.speed * 1.25)
    expect(pistol.projectile.radius).toBe(base.projectile.radius)
  })
})

describe('价格：前期折扣 + 随波通胀', () => {
  it('第 1 波打前期折扣（便宜）；折扣到 earlyFadeWaves 波归零，此后为纯通胀', () => {
    expect(itemPrice('gemHeart', 1)).toBe(
      Math.round(ITEMS.gemHeart.price * (1 - PRICE.earlyDiscount)),
    )
    expect(itemPrice('gemHeart', 1)).toBeLessThan(ITEMS.gemHeart.price)
    // 折扣消退后（wave 11 > earlyFadeWaves）= 纯通胀
    expect(itemPrice('gemHeart', 11)).toBe(Math.round(ITEMS.gemHeart.price * (1 + PRICE.perWave * 10)))
    expect(itemPrice('gemHeart', 15)).toBeGreaterThan(itemPrice('gemHeart', 5))
  })
})
