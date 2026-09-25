import { ITEMS, ITEM_IDS, RARITY_ORDER } from '../data/items'
import { loadoutFor } from '../data/characters'
import { CARDS, CARD_IDS } from '../data/cards'
import { CHAR_XP_THRESHOLDS, MAX_CHAR_LEVEL, characterLevel } from '../data/charLevel'
import type { ItemDef, ItemId, ItemRarity } from '../types/items'
import type { CardId } from '../types/cards'
import type { CharacterDef, UpgradeTiers } from '../types/characters'
import type { LevelProgress } from '../types/charLevel'

function rarityWeights(wave: number, level = 1): Record<ItemRarity, number> {
  const lv = Math.max(0, level - 1)
  const rare = Math.min(0.5, 0.06 + 0.02 * wave + 0.14 * lv)
  const epicBase = wave < 5 ? 0 : Math.min(0.2, 0.025 * (wave - 4))
  const epic = Math.min(0.42, epicBase + 0.13 * lv + (lv > 0 ? 0.05 : 0))
  const common = Math.max(0.05, 1 - rare - epic)
  return { common, rare, epic }
}
export function characterPoolFor(def: CharacterDef, level: number): ItemId[] {
  const tiers: UpgradeTiers = { u1: level >= 2, u2: level >= 3 }
  const kinds = new Set<string>(loadoutFor(def, tiers).map((w) => w.kind))
  return ITEM_IDS.filter((iid) => {
    const item: ItemDef = ITEMS[iid]
    if ((item.minLevel ?? 1) > level) return false
    return item.pool === 'all' || kinds.has(item.pool)
  })
}
export function stackCount(owned: readonly ItemId[], id: ItemId): number {
  return owned.filter((x) => x === id).length
}
function reachedStackLimit(owned: readonly ItemId[], id: ItemId): boolean {
  const def: ItemDef = ITEMS[id]
  return def.maxStacks !== undefined && stackCount(owned, id) >= def.maxStacks
}
export function rollItem(
  pool: readonly ItemId[],
  owned: readonly ItemId[],
  rand: () => number,
  wave = 1,
  level = 1,
): ItemId | null {
  const avail = pool.filter((id) => !reachedStackLimit(owned, id))
  if (avail.length === 0) return null
  const weights = rarityWeights(wave, level)
  const buckets = RARITY_ORDER.map((r) => ({
    items: avail.filter((id) => ITEMS[id].rarity === r),
    w: weights[r],
  })).filter((b) => b.items.length > 0 && b.w > 0)
  let pickList: readonly ItemId[] = avail
  const totalW = buckets.reduce((s, b) => s + b.w, 0)
  if (totalW > 0) {
    let t = rand() * totalW
    let chosen = buckets[buckets.length - 1]!
    for (const b of buckets) {
      if (t < b.w) {
        chosen = b
        break
      }
      t -= b.w
    }
    pickList = chosen.items
  }
  return pickList[Math.min(pickList.length - 1, Math.floor(rand() * pickList.length))]!
}

function cardAtMax(owned: Readonly<Record<string, number>>, id: CardId): boolean {
  return (owned[id] ?? 0) >= CARDS[id].maxLevel
}
export function rollCardChoices(
  owned: Readonly<Record<string, number>>,
  rand: () => number,
  count: number,
  wave = 1,
): CardId[] {
  const pool = CARD_IDS.filter((id) => !cardAtMax(owned, id))
  const weights = rarityWeights(wave)
  const w = (id: CardId): number => Math.max(0.0001, weights[CARDS[id].rarity])
  const chosen: CardId[] = []
  while (chosen.length < count && pool.length > 0) {
    let total = 0
    for (const id of pool) total += w(id)
    let t = rand() * total
    let idx = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      if (t < w(pool[i]!)) {
        idx = i
        break
      }
      t -= w(pool[i]!)
    }
    chosen.push(pool[idx]!)
    pool.splice(idx, 1)
  }
  return chosen
}

export function levelProgress(xp: number): LevelProgress {
  const level = characterLevel(xp)
  if (level >= MAX_CHAR_LEVEL) return { maxed: true, cur: 0, need: 0, ratio: 1 }
  const prev = level === 1 ? 0 : CHAR_XP_THRESHOLDS[level - 2]!
  const next = CHAR_XP_THRESHOLDS[level - 1]!
  const cur = xp - prev
  const need = next - prev
  return { maxed: false, cur, need, ratio: Math.max(0, Math.min(1, cur / need)) }
}
