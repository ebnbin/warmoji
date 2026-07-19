import { describe, expect, it } from 'vitest'
import { CHARACTERS } from '../characters/registry'
import { WEAPONS } from '../weapons/registry'
import type { ItemRarity, ItemSpec } from './registry'
import {
  ABILITY_GATE,
  abilityCardAvailable,
  abilityTiers,
  itemPrice,
  PRICE,
  aggregateCharacterEffects,
  aggregateTeamEffects,
  captainPool,
  characterPool,
  ITEM_IDS,
  ITEMS,
  RARITY_ORDER,
  rarityWeights,
  reachedStackLimit,
  resolveWeaponSpec,
  rollItem,
} from './registry'

describe('道具定义', () => {
  it('每件道具有 emoji/名字/介绍/正价格；能力卡效果走武器质变，其余至少一条效果', () => {
    for (const id of ITEM_IDS) {
      const item = ITEMS[id]
      expect(item.emoji.length).toBeGreaterThan(0)
      expect(item.name.length).toBeGreaterThan(0)
      expect(item.desc.length).toBeGreaterThan(0)
      expect(item.price).toBeGreaterThan(0)
      if (item.pool === 'ability') {
        expect(item.forCharacter).toBeDefined()
        expect(item.maxStacks).toBe(1)
      } else {
        expect(Object.keys(item.effects).length).toBeGreaterThan(0)
      }
    }
  })

  it('每个角色恰好两张能力卡：一阶稀有、二阶史诗', () => {
    for (const cid of Object.keys(CHARACTERS)) {
      const cards = ITEM_IDS.filter(
        (id) => ITEMS[id].pool === 'ability' && ITEMS[id].forCharacter === cid,
      )
      expect(cards).toHaveLength(2)
      const first = cards.find((id) => (ITEMS[id] as ItemSpec).abilityIndex === 0)!
      const second = cards.find((id) => (ITEMS[id] as ItemSpec).abilityIndex === 1)!
      expect(ITEMS[first].rarity).toBe('rare')
      expect(ITEMS[second].rarity).toBe('epic')
      expect(ITEMS[second].price).toBeGreaterThan(ITEMS[first].price)
    }
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

  it('权重曲线：和为 1、非负；史诗第 5 波前为 0，档位权重随波次单调不减且有封顶', () => {
    for (let w = 1; w <= 15; w++) {
      const wt = rarityWeights(w)
      expect(wt.common + wt.rare + wt.epic).toBeCloseTo(1)
      expect(Math.min(wt.common, wt.rare, wt.epic)).toBeGreaterThanOrEqual(0)
    }
    expect(rarityWeights(1).epic).toBe(0)
    expect(rarityWeights(4).epic).toBe(0)
    expect(rarityWeights(5).epic).toBeGreaterThan(0)
    expect(rarityWeights(12).rare).toBeCloseTo(0.3)
    expect(rarityWeights(15).epic).toBeCloseTo(0.2)
    expect(rarityWeights(15).rare).toBeGreaterThan(rarityWeights(1).rare)
  })

  it('第 1 波抽不到史诗；后期高随机数落入史诗档', () => {
    const pool = ['gemHeart', 'fateDice'] as const
    // rand 恒 0.99：第 1 波史诗权重 0 → 只能抽普通；第 15 波 → 落入档尾（史诗）
    expect(rollItem([...pool], [], () => 0.99, 1)).toBe('gemHeart')
    expect(rollItem([...pool], [], () => 0.99, 15)).toBe('fateDice')
  })

  it('空档权重归拢：池里只剩史诗而史诗未解锁时仍可上架（兜底不空货）', () => {
    expect(rollItem(['fateDice'], [], () => 0.99, 1)).toBe('fateDice')
  })
})

describe('道具池推导', () => {
  it('角色池 = 通用 + 匹配武器形态 + 自己的能力卡；不含队长道具与他人能力卡', () => {
    const magePool = characterPool('mage', CHARACTERS.mage)
    expect(magePool).toContain('gemHeart')
    expect(magePool).toContain('blastPowder')
    expect(magePool).toContain('abilityMage1')
    expect(magePool).toContain('abilityMage2')
    expect(magePool).not.toContain('abilityTroll1')
    expect(magePool).not.toContain('scope')
    expect(magePool).not.toContain('marchFlag')
    const cowboyPool = characterPool('cowboy', CHARACTERS.cowboy)
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
    for (const [cid, spec] of Object.entries(CHARACTERS)) {
      expect(characterPool(cid as keyof typeof CHARACTERS, spec).length).toBeGreaterThanOrEqual(genericCount)
    }
  })
})

describe('能力卡解锁门控', () => {
  it('一阶卡：普通道具购满门槛才可上架；二阶卡：需已持有一阶', () => {
    expect(abilityCardAvailable('abilityMage1', [])).toBe(false)
    const normals = Array<'gemHeart'>(ABILITY_GATE.normalsForFirst).fill('gemHeart')
    expect(abilityCardAvailable('abilityMage1', normals.slice(0, 1))).toBe(false)
    expect(abilityCardAvailable('abilityMage1', normals)).toBe(true)
    // 能力卡本身不计入普通道具数
    expect(abilityCardAvailable('abilityMage2', normals)).toBe(false)
    expect(abilityCardAvailable('abilityMage2', [...normals, 'abilityMage1'])).toBe(true)
    // 非能力卡永远可上架
    expect(abilityCardAvailable('gemHeart', [])).toBe(true)
  })

  it('rollItem 过滤未达门槛的能力卡；达标后可抽出', () => {
    expect(rollItem(['abilityMage1'], [], () => 0, 5)).toBe(null)
    const owned = ['gemHeart', 'gemHeart'] as const
    expect(rollItem(['abilityMage1'], [...owned], () => 0, 5)).toBe('abilityMage1')
  })

  it('abilityTiers 由已购卡推导', () => {
    expect(abilityTiers('mage', [])).toEqual({ a1: false, a2: false })
    expect(abilityTiers('mage', ['abilityMage1'])).toEqual({ a1: true, a2: false })
    expect(abilityTiers('mage', ['abilityMage1', 'abilityMage2'])).toEqual({ a1: true, a2: true })
    // 别人的卡不算
    expect(abilityTiers('mage', ['abilityTroll1'])).toEqual({ a1: false, a2: false })
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

  it('新团队轴：经验叠乘、敌速有保底、波末回复封顶、分红叠加', () => {
    const fx = aggregateTeamEffects(['clover', 'fieldKitchen', 'warBond', 'warBond', 'timeSand'])
    expect(fx.xpGainMul).toBeCloseTo(1.15)
    expect(fx.enemySlowMul).toBeCloseTo(0.88)
    expect(fx.waveHealRatio).toBeCloseTo(0.25)
    expect(fx.waveCoins).toBe(20)
    expect(aggregateTeamEffects(Array(8).fill('timeSand')).enemySlowMul).toBe(0.6)
    expect(aggregateTeamEffects(Array(8).fill('fieldKitchen')).waveHealRatio).toBe(0.6)
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

describe('价格通胀', () => {
  it('第 1 波为基准价，随波次线性上浮并取整', () => {
    expect(itemPrice('gemHeart', 1)).toBe(ITEMS.gemHeart.price)
    expect(itemPrice('gemHeart', 11)).toBe(Math.round(ITEMS.gemHeart.price * (1 + PRICE.perWave * 10)))
    expect(itemPrice('gemHeart', 15)).toBeGreaterThan(itemPrice('gemHeart', 5))
  })
})
