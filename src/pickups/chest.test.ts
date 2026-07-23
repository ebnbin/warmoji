import { describe, expect, it } from 'vitest'
import { chestCandidates, chestDropped, chestTargets, rollChestLoot } from './chest'
import { CHEST_LOOT } from './chest'
import type { CharacterId } from '../characters/registry'
import type { ItemId } from '../items/registry'
import { ITEMS } from '../items/registry'
import { Rng } from '../core/rng'

describe('chest 掉落判定', () => {
  it('普通怪按 chance、精英按更高的 eliteChance', () => {
    expect(CHEST_LOOT.eliteChance).toBeGreaterThan(CHEST_LOOT.chance)
    expect(chestDropped(false, () => CHEST_LOOT.chance - 0.0001)).toBe(true)
    expect(chestDropped(false, () => CHEST_LOOT.chance)).toBe(false)
    expect(chestDropped(true, () => CHEST_LOOT.eliteChance - 0.0001)).toBe(true)
    expect(chestDropped(true, () => CHEST_LOOT.eliteChance)).toBe(false)
  })

  it('福运卡掉率倍率放大掉落判定阈值', () => {
    const r = CHEST_LOOT.chance * 1.5
    expect(chestDropped(false, () => r, 1)).toBe(false)
    expect(chestDropped(false, () => r, 2)).toBe(true)
  })
})

describe('chest 候选池：上场角色当前等级的道具池', () => {
  it('无道具时含通用/形态道具，且都归角色槽位', () => {
    const entries = chestCandidates(['juggler'], [[]], [1])
    const ids = entries.map((e) => e.itemId)
    expect(ids).toContain('gemHeart') // 通用池
    expect(entries.every((e) => e.slot >= 0)).toBe(true)
    expect(entries.find((e) => e.itemId === 'gemHeart')!.slot).toBe(0)
  })

  it('高端货按角色等级解锁（fateDice minLevel 2）', () => {
    expect(chestCandidates(['juggler'], [[]], [1]).map((e) => e.itemId)).not.toContain('fateDice')
    expect(chestCandidates(['juggler'], [[]], [2]).map((e) => e.itemId)).toContain('fateDice')
  })

  it('堆叠上限的道具不再入围', () => {
    const owned: ItemId[] = ['shellArmor', 'shellArmor', 'shellArmor'] // maxStacks 3
    expect(chestCandidates(['juggler'], [owned], [1]).map((e) => e.itemId)).not.toContain('shellArmor')
  })

  it('同一道具进多个角色池 = 各自独立条目（抽中谁归谁）', () => {
    const entries = chestCandidates(['juggler', 'mage'], [[], []], [1, 1])
    const slots = entries.filter((e) => e.itemId === 'gemHeart').map((e) => e.slot)
    expect(slots.sort()).toEqual([0, 1])
  })

  it('空阵容无候选', () => {
    expect(chestCandidates([], [], [])).toEqual([])
  })
})

describe('chest 开箱抽取：越稀有概率越低', () => {
  it('大样本下普通 > 稀有 > 史诗，且抽取结果都来自候选池', () => {
    const rng = new Rng(20260717)
    const roster = ['juggler', 'mage'] as const
    // 用 3 级角色，池里含稀有/史诗，验证稀有度权重分布
    const levels = [3, 3]
    const candidateKeys = new Set(
      chestCandidates(roster, [[], []], levels).map((e) => `${e.slot}:${e.itemId}`),
    )
    const byRarity = { common: 0, rare: 0, epic: 0 }
    for (let i = 0; i < 3000; i++) {
      const loot = rollChestLoot(roster, [[], []], levels, () => rng.next())
      expect(loot).not.toBeNull()
      expect(candidateKeys.has(`${loot!.slot}:${loot!.itemId}`)).toBe(true)
      byRarity[ITEMS[loot!.itemId].rarity]++
    }
    expect(byRarity.common).toBeGreaterThan(byRarity.rare)
    expect(byRarity.rare).toBeGreaterThan(byRarity.epic)
    expect(byRarity.rare).toBeGreaterThan(0)
    expect(byRarity.epic).toBeGreaterThan(0)
  })
})

// 开箱页据此列出「这件道具此刻能给谁」（只列角色槽位）
describe('chestTargets 某道具的可应用目标', () => {
  const roster = ['juggler', 'unicorn', 'troll'] as CharacterId[]
  const empty: ItemId[][] = [[], [], []]
  const lv1 = [1, 1, 1]

  it('通用道具人人可用：返回全部角色槽位', () => {
    expect(chestTargets(roster, empty, lv1, 'gemHeart' as ItemId)).toEqual([0, 1, 2])
  })

  it('某角色满层则排除该槽位', () => {
    const items: ItemId[][] = [[], ['vampFang', 'vampFang'] as ItemId[], []] // vampFang max=2
    expect(chestTargets(roster, items, lv1, 'vampFang' as ItemId)).toEqual([0, 2])
  })

  it('高端货按等级解锁：仅达标等级的槽位可用', () => {
    // fateDice minLevel 2：全 1 级时无人可用；把槽位 0 升到 2 级则只有它可用
    expect(chestTargets(roster, empty, lv1, 'fateDice' as ItemId)).toEqual([])
    expect(chestTargets(roster, empty, [2, 1, 1], 'fateDice' as ItemId)).toEqual([0])
  })
})
