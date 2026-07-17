import { describe, expect, it } from 'vitest'
import { chestCandidates, chestDropped, rollChestLoot } from './chest'
import { CHEST } from './config'
import type { ItemId } from './items'
import { ITEMS } from './items'
import { Rng } from './rng'

describe('chest 掉落判定', () => {
  it('普通怪按 chance、精英按更高的 eliteChance', () => {
    expect(CHEST.eliteChance).toBeGreaterThan(CHEST.chance)
    expect(chestDropped(false, () => CHEST.chance - 0.0001)).toBe(true)
    expect(chestDropped(false, () => CHEST.chance)).toBe(false)
    expect(chestDropped(true, () => CHEST.eliteChance - 0.0001)).toBe(true)
    expect(chestDropped(true, () => CHEST.eliteChance)).toBe(false)
  })
})

describe('chest 候选池：上场角色池 ∪ 队长池', () => {
  it('无道具时含通用/形态/队长道具，不含未解锁的能力卡', () => {
    const entries = chestCandidates(['juggler'], [[]], [])
    const ids = entries.map((e) => e.itemId)
    expect(ids).toContain('gemHeart') // 通用池
    expect(ids).toContain('marchFlag') // 队长池
    expect(ids).not.toContain('abilityJuggler1') // 门槛未达
    expect(ids).not.toContain('abilityMage1') // 不在场角色的专属卡
    // 归属：队长道具 slot -1，角色道具 slot 0
    expect(entries.find((e) => e.itemId === 'marchFlag')!.slot).toBe(-1)
    expect(entries.find((e) => e.itemId === 'gemHeart')!.slot).toBe(0)
  })

  it('能力卡沿用商店门槛：2 张普通卡解锁一阶，持有一阶解锁二阶', () => {
    const gated = chestCandidates(['juggler'], [['gemHeart', 'whetstone']], [])
    expect(gated.map((e) => e.itemId)).toContain('abilityJuggler1')
    expect(gated.map((e) => e.itemId)).not.toContain('abilityJuggler2')
    const tier2 = chestCandidates(['juggler'], [['gemHeart', 'whetstone', 'abilityJuggler1']], [])
    expect(tier2.map((e) => e.itemId)).toContain('abilityJuggler2')
  })

  it('堆叠上限的道具不再入围（角色与队长两侧都生效）', () => {
    const owned: ItemId[] = ['shellArmor', 'shellArmor', 'shellArmor'] // maxStacks 3
    expect(chestCandidates(['juggler'], [owned], []).map((e) => e.itemId)).not.toContain(
      'shellArmor',
    )
    const captain: ItemId[] = ['marchFlag', 'marchFlag', 'marchFlag']
    expect(chestCandidates([], [], captain).map((e) => e.itemId)).not.toContain('marchFlag')
  })

  it('同一道具进多个角色池 = 各自独立条目（抽中谁归谁）', () => {
    const entries = chestCandidates(['juggler', 'mage'], [[], []], [])
    const slots = entries.filter((e) => e.itemId === 'gemHeart').map((e) => e.slot)
    expect(slots.sort()).toEqual([0, 1])
  })

  it('空阵容仍可开出队长道具', () => {
    const entries = chestCandidates([], [], [])
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.slot === -1)).toBe(true)
  })
})

describe('chest 开箱抽取：越稀有概率越低', () => {
  it('大样本下普通 > 稀有 > 史诗，且抽取结果都来自候选池', () => {
    const rng = new Rng(20260717)
    const roster = ['juggler', 'mage'] as const
    const candidateKeys = new Set(
      chestCandidates(roster, [[], []], []).map((e) => `${e.slot}:${e.itemId}`),
    )
    const byRarity = { common: 0, rare: 0, epic: 0 }
    for (let i = 0; i < 3000; i++) {
      const loot = rollChestLoot(roster, [[], []], [], () => rng.next())
      expect(loot).not.toBeNull()
      expect(candidateKeys.has(`${loot!.slot}:${loot!.itemId}`)).toBe(true)
      byRarity[ITEMS[loot!.itemId].rarity]++
    }
    expect(byRarity.common).toBeGreaterThan(byRarity.rare)
    expect(byRarity.rare).toBeGreaterThan(byRarity.epic)
    // 稀有/史诗抽得到（不是零概率）
    expect(byRarity.rare).toBeGreaterThan(0)
    expect(byRarity.epic).toBeGreaterThan(0)
  })
})
