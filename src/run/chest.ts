import { CHARACTERS } from '../characters/registry'
import type { CharacterId } from '../characters/registry'
import type { ItemId } from '../items/registry'
import { abilityCardAvailable, captainPool, characterPool, ITEMS, reachedStackLimit } from '../items/registry'

// 宝箱开箱抽取：候选 = 各上场角色的道具池 ∪ 队长道具池，即「本局当前阵容
// 用得上的道具」。同一道具进多个角色的池 = 多个候选条目，抽中哪条归谁；
// 尊重堆叠上限与能力卡解锁门槛（和商店同规则），按稀有度权重加权抽取。

/** 开箱战利品：道具 + 归属（slot = 角色槽位；-1 = 队长/团队道具） */
export interface ChestLoot {
  itemId: ItemId
  slot: number
}

/** 击杀是否掉落宝箱 */
export function chestDropped(elite: boolean, rand: () => number): boolean {
  return rand() < (elite ? CHEST.eliteChance : CHEST.chance)
}

/** 全部候选条目（导出供测试校验覆盖面） */
export function chestCandidates(
  roster: readonly CharacterId[],
  memberItems: readonly (readonly ItemId[])[],
  captainItems: readonly ItemId[],
): ChestLoot[] {
  const entries: ChestLoot[] = []
  roster.forEach((id, slot) => {
    const owned = memberItems[slot] ?? []
    for (const itemId of characterPool(id, CHARACTERS[id])) {
      if (reachedStackLimit(owned, itemId)) continue
      if (!abilityCardAvailable(itemId, owned)) continue
      entries.push({ itemId, slot })
    }
  })
  for (const itemId of captainPool()) {
    if (!reachedStackLimit(captainItems, itemId)) entries.push({ itemId, slot: -1 })
  }
  return entries
}

/** 开箱：稀有度加权随机抽 1 件；全无候选（池全部抽满）返回 null */
export function rollChestLoot(
  roster: readonly CharacterId[],
  memberItems: readonly (readonly ItemId[])[],
  captainItems: readonly ItemId[],
  rand: () => number,
): ChestLoot | null {
  const entries = chestCandidates(roster, memberItems, captainItems)
  if (entries.length === 0) return null
  let total = 0
  for (const e of entries) total += CHEST.rarityWeights[ITEMS[e.itemId].rarity]
  let t = rand() * total
  for (const e of entries) {
    const w = CHEST.rarityWeights[ITEMS[e.itemId].rarity]
    if (t < w) return e
    t -= w
  }
  return entries[entries.length - 1]!
}

// 宝箱：击杀极小概率掉落（精英显著更高），拾取开出 1 件免费随机道具，
// 立即生效。抽取范围与权重见 本文件；与金币同磁吸，波末未拾取消失
export const CHEST = {
  emoji: '🎁',
  size: 0.8,
  radius: 0.3,
  chance: 0.008,
  eliteChance: 0.08,
  /** 开箱稀有度权重：越稀有越难开出 */
  rarityWeights: { common: 1, rare: 0.3, epic: 0.08 },
  /** 兜底金币：全队所有道具池都抽无可抽时（几乎不可能）宝箱改吐金币 */
  fallbackCoins: 10,
} as const
