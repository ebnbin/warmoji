import type { CharacterId } from '../config'
import { CHARACTERS, CHEST } from '../config'
import type { ItemId } from './registry'
import { abilityCardAvailable, captainPool, characterPool, ITEMS, reachedStackLimit } from './registry'

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
