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
    // rand 落在 [chance, chance×2) 之间：×1 不掉，×2 掉
    const r = CHEST_LOOT.chance * 1.5
    expect(chestDropped(false, () => r, 1)).toBe(false)
    expect(chestDropped(false, () => r, 2)).toBe(true)
  })
})

describe('chest 候选池：上场角色的道具池（团队增益已迁到升级卡）', () => {
  it('无道具时含通用/形态道具，不含未解锁的升级卡，且都归角色槽位', () => {
    const entries = chestCandidates(['juggler'], [[]])
    const ids = entries.map((e) => e.itemId)
    expect(ids).toContain('gemHeart') // 通用池
    expect(ids).not.toContain('upgradeJuggler1') // 门槛未达
    expect(ids).not.toContain('upgradeMage1') // 不在场角色的专属卡
    expect(entries.every((e) => e.slot >= 0)).toBe(true)
    expect(entries.find((e) => e.itemId === 'gemHeart')!.slot).toBe(0)
  })

  it('升级卡沿用商店门槛：2 张普通卡解锁一阶，持有一阶解锁二阶', () => {
    const gated = chestCandidates(['juggler'], [['gemHeart', 'whetstone']])
    expect(gated.map((e) => e.itemId)).toContain('upgradeJuggler1')
    expect(gated.map((e) => e.itemId)).not.toContain('upgradeJuggler2')
    const tier2 = chestCandidates(['juggler'], [['gemHeart', 'whetstone', 'upgradeJuggler1']])
    expect(tier2.map((e) => e.itemId)).toContain('upgradeJuggler2')
  })

  it('堆叠上限的道具不再入围', () => {
    const owned: ItemId[] = ['shellArmor', 'shellArmor', 'shellArmor'] // maxStacks 3
    expect(chestCandidates(['juggler'], [owned]).map((e) => e.itemId)).not.toContain('shellArmor')
  })

  it('同一道具进多个角色池 = 各自独立条目（抽中谁归谁）', () => {
    const entries = chestCandidates(['juggler', 'mage'], [[], []])
    const slots = entries.filter((e) => e.itemId === 'gemHeart').map((e) => e.slot)
    expect(slots.sort()).toEqual([0, 1])
  })

  it('空阵容无候选（团队道具不再走宝箱）', () => {
    expect(chestCandidates([], [])).toEqual([])
  })
})

describe('chest 开箱抽取：越稀有概率越低', () => {
  it('大样本下普通 > 稀有 > 史诗，且抽取结果都来自候选池', () => {
    const rng = new Rng(20260717)
    const roster = ['juggler', 'mage'] as const
    const candidateKeys = new Set(
      chestCandidates(roster, [[], []]).map((e) => `${e.slot}:${e.itemId}`),
    )
    const byRarity = { common: 0, rare: 0, epic: 0 }
    for (let i = 0; i < 3000; i++) {
      const loot = rollChestLoot(roster, [[], []], () => rng.next())
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

  it('通用道具人人可用：返回全部角色槽位', () => {
    expect(chestTargets(roster, empty, 'gemHeart' as ItemId)).toEqual([0, 1, 2])
  })

  it('某角色满层则排除该槽位', () => {
    const items: ItemId[][] = [[], ['vampFang', 'vampFang'] as ItemId[], []] // vampFang max=2
    expect(chestTargets(roster, items, 'vampFang' as ItemId)).toEqual([0, 2])
  })

  it('升级卡仅归属角色、且需先满足解锁门槛', () => {
    expect(chestTargets(roster, empty, 'upgradeJuggler1' as ItemId)).toEqual([])
    const gated: ItemId[][] = [['gemHeart', 'whetstone'] as ItemId[], [], []]
    expect(chestTargets(roster, gated, 'upgradeJuggler1' as ItemId)).toEqual([0])
    const other: ItemId[][] = [[], ['gemHeart', 'whetstone'] as ItemId[], []]
    expect(chestTargets(roster, other, 'upgradeJuggler1' as ItemId)).toEqual([])
  })
})
