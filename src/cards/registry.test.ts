import { describe, expect, it } from 'vitest'
import { CARDS, CARD_IDS, aggregateTeamCards, cardAtMax, rollCardChoices } from './registry'
import { TEAM_FX_IDENTITY, foldTeamEffects } from '../items/registry'
import { Rng } from '../core/rng'

describe('团队卡定义', () => {
  it('每张卡有 emoji/名字/介绍/正整数上限/至少一条效果', () => {
    for (const id of CARD_IDS) {
      const c = CARDS[id]
      expect(c.emoji.length).toBeGreaterThan(0)
      expect(c.name.length).toBeGreaterThan(0)
      expect(c.desc.length).toBeGreaterThan(0)
      expect(c.maxLevel).toBeGreaterThanOrEqual(1)
      expect(c.tags.length).toBeGreaterThan(0)
      expect(Object.keys(c.effects).length).toBeGreaterThan(0)
    }
  })
})

describe('foldTeamEffects 叠加', () => {
  it('空 = 单位元', () => {
    expect(foldTeamEffects([])).toEqual(TEAM_FX_IDENTITY)
  })

  it('乘区相乘、加区相加', () => {
    const fx = foldTeamEffects([{ teamDamageMul: 1.1 }, { teamDamageMul: 1.1 }, { waveCoins: 10 }, { waveCoins: 5 }])
    expect(fx.teamDamageMul).toBeCloseTo(1.21)
    expect(fx.waveCoins).toBe(15)
  })

  it('封顶/保底：暴击≤0.5、折扣≥0.4、生命≥0.3、攻速≥0.4、复活≥0.3', () => {
    const fx = foldTeamEffects([
      { critAdd: 0.4 },
      { critAdd: 0.4 },
      { shopDiscountMul: 0.1 },
      { teamHpMul: 0.1 },
      { teamCooldownMul: 0.1 },
      { reviveMul: 0.1 },
    ])
    expect(fx.critAdd).toBe(0.5)
    expect(fx.shopDiscountMul).toBe(0.4)
    expect(fx.teamHpMul).toBe(0.3)
    expect(fx.teamCooldownMul).toBe(0.4)
    expect(fx.reviveMul).toBe(0.3)
  })
})

describe('aggregateTeamCards 按卡等级叠加', () => {
  it('同一张卡按等级叠加对应次数', () => {
    expect(aggregateTeamCards({ sharpen: 3 }).teamDamageMul).toBeCloseTo(1.1 ** 3)
    expect(aggregateTeamCards({ swift: 2 }).moveSpeedMul).toBeCloseTo(1.08 ** 2)
  })

  it('等级超过上限时按上限截断', () => {
    // wideDraft maxLevel 2 → 即便记了 5 级也只叠 2 次
    expect(aggregateTeamCards({ wideDraft: 5 }).draftSize).toBe(2)
  })

  it('打包权衡卡：正负同时生效', () => {
    const fx = aggregateTeamCards({ artillery: 1 })
    expect(fx.teamDamageMul).toBeCloseTo(1.3)
    expect(fx.moveSpeedMul).toBeCloseTo(0.88)
  })

  it('未知卡 id 忽略，空表 = 单位元', () => {
    expect(aggregateTeamCards({ nope: 3 })).toEqual(TEAM_FX_IDENTITY)
    expect(aggregateTeamCards({})).toEqual(TEAM_FX_IDENTITY)
  })
})

describe('rollCardChoices 抽卡候选', () => {
  it('返回 count 张互不相同、未满级的卡', () => {
    const rng = new Rng(4242)
    const choices = rollCardChoices({}, () => rng.next(), 3, 8)
    expect(choices).toHaveLength(3)
    expect(new Set(choices).size).toBe(3)
    for (const id of choices) expect(cardAtMax({}, id)).toBe(false)
  })

  it('已满级的卡不再入选', () => {
    // 把除一张外的所有卡都记满级 → 只可能抽到那一张
    const owned: Record<string, number> = {}
    const keep = 'sharpen'
    for (const id of CARD_IDS) if (id !== keep) owned[id] = CARDS[id].maxLevel
    const rng = new Rng(7)
    const choices = rollCardChoices(owned, () => rng.next(), 3, 8)
    expect(choices).toEqual([keep])
  })

  it('候选数超过可用卡数时返回全部可用（不重复）', () => {
    const owned: Record<string, number> = {}
    for (const id of CARD_IDS) owned[id] = CARDS[id].maxLevel
    // 只剩两张没满
    delete owned['swift']
    delete owned['vigor']
    const rng = new Rng(9)
    const choices = rollCardChoices(owned, () => rng.next(), 5, 8)
    expect(new Set(choices)).toEqual(new Set(['swift', 'vigor']))
  })
})
