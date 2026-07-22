import { CHARACTERS } from '../characters/registry'
import type { CharacterId } from '../characters/registry'
import type { ItemId } from '../items/registry'
import { upgradeCardAvailable, characterPool, ITEMS, reachedStackLimit } from '../items/registry'

// 宝箱掉落抽取：候选 = 各上场角色的道具池，即「本局当前阵容用得上的道具」。
// 同一道具进多个角色的池 = 多个候选条目，抽中哪条只取其道具（归属留给战斗后的
// 开箱页由玩家选）；尊重堆叠上限与升级卡解锁门槛（和商店同规则），按稀有度权重
// 加权抽取。开箱页再用 chestTargets 现算某道具此刻能给谁。团队增益已迁到升级卡，
// 宝箱只掉角色装备。

/** 掉落抽取结果：道具 + 一个可用归属（slot = 角色槽位） */
export interface ChestLoot {
  itemId: ItemId
  slot: number
}

/** 击杀是否掉落宝箱；chanceMul = 团队福运卡的掉率倍率 */
export function chestDropped(elite: boolean, rand: () => number, chanceMul = 1): boolean {
  return rand() < (elite ? CHEST_LOOT.eliteChance : CHEST_LOOT.chance) * chanceMul
}

/** 全部候选条目（导出供测试校验覆盖面） */
export function chestCandidates(
  roster: readonly CharacterId[],
  memberItems: readonly (readonly ItemId[])[],
): ChestLoot[] {
  const entries: ChestLoot[] = []
  roster.forEach((id, slot) => {
    const owned = memberItems[slot] ?? []
    for (const itemId of characterPool(id, CHARACTERS[id])) {
      if (reachedStackLimit(owned, itemId)) continue
      if (!upgradeCardAvailable(itemId, owned)) continue
      entries.push({ itemId, slot })
    }
  })
  return entries
}

/** 某道具此刻可应用的槽位：开箱页据此列出可选角色。
 * 与掉落同规则（池匹配 + 堆叠上限 + 升级卡门槛），空数组 = 只能丢弃 */
export function chestTargets(
  roster: readonly CharacterId[],
  memberItems: readonly (readonly ItemId[])[],
  itemId: ItemId,
): number[] {
  return chestCandidates(roster, memberItems)
    .filter((c) => c.itemId === itemId)
    .map((c) => c.slot)
}

/** 开箱：稀有度加权随机抽 1 件；全无候选（池全部抽满）返回 null */
export function rollChestLoot(
  roster: readonly CharacterId[],
  memberItems: readonly (readonly ItemId[])[],
  rand: () => number,
): ChestLoot | null {
  const entries = chestCandidates(roster, memberItems)
  if (entries.length === 0) return null
  let total = 0
  for (const e of entries) total += CHEST_LOOT.rarityWeights[ITEMS[e.itemId].rarity]
  let t = rand() * total
  for (const e of entries) {
    const w = CHEST_LOOT.rarityWeights[ITEMS[e.itemId].rarity]
    if (t < w) return e
    t -= w
  }
  return entries[entries.length - 1]!
}

// 宝箱掉落经济旋钮：击杀极小概率掉落（精英显著更高）。拾取只收集不开，
// 战斗后统一进开箱页。宝箱实体本身（emoji/尺寸）在 pickups/registry
export const CHEST_LOOT = {
  chance: 0.008,
  eliteChance: 0.08,
  /** 开箱稀有度权重：越稀有越难开出 */
  rarityWeights: { common: 1, rare: 0.3, epic: 0.08 },
} as const
