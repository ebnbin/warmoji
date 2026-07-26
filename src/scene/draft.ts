import { ITEMS, ITEM_IDS, RARITY_ORDER } from '../data/items'
import { loadoutFor } from '../data/characters'
import { CARDS, CARD_IDS } from '../data/cards'
import { CHAR_XP_THRESHOLDS, MAX_CHAR_LEVEL, characterLevel } from '../data/charLevel'
import type { ItemDef, ItemId, ItemRarity } from '../types/items'
import type { CardId } from '../types/cards'
import type { CharacterDef, UpgradeTiers } from '../types/characters'
import type { LevelProgress } from '../types/charLevel'

// 抽取与商店规则：稀有度权重、道具池、抽卡、持有计数、角色等级进度条。
// 这些只服务商店 / 卡牌 / 整编三个页面——去掉这几个玩法它们一行都没有意义，
// 故随消费方放在 scene/ 而非内容层。

/** 上架稀有度权重：随波次向稀有倾斜 + 随「角色等级」独立抬升——每个等级形态一套
 * 独立概率，越高级越常刷出稀有/史诗（史诗常规第 5 波起解锁，但 2 级起角色即便早波
 * 也能刷出）。返回的是相对权重（rollItem 内部归一），无需严格和为 1 */
export function rarityWeights(wave: number, level = 1): Record<ItemRarity, number> {
  const lv = Math.max(0, level - 1)
  const rare = Math.min(0.5, 0.06 + 0.02 * wave + 0.14 * lv)
  const epicBase = wave < 5 ? 0 : Math.min(0.2, 0.025 * (wave - 4))
  const epic = Math.min(0.42, epicBase + 0.13 * lv + (lv > 0 ? 0.05 : 0))
  const common = Math.max(0.05, 1 - rare - epic)
  return { common, rare, epic }
}
/** 某等级角色的道具池 = 通用道具 + 匹配该等级能力形态的形态道具，且满足最低等级门槛。
 * 升级 = 换了整套能力形态 + 解锁更高端的货架，故池随等级独立变化。 */
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
export function reachedStackLimit(owned: readonly ItemId[], id: ItemId): boolean {
  const def: ItemDef = ITEMS[id]
  return def.maxStacks !== undefined && stackCount(owned, id) >= def.maxStacks
}
/** 从池中随机上架一件未达上限的道具；全部达上限返回 null。
 * 两段式抽取：先按波次权重在「有货的稀有度档」间抽签（无货/零权重档的权重
 * 自然归拢到其余档），再在档内均匀抽取 */
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

/** 某卡是否还能再抽（未达上限） */
export function cardAtMax(owned: Readonly<Record<string, number>>, id: CardId): boolean {
  return (owned[id] ?? 0) >= CARDS[id].maxLevel
}
/** 一次抽卡的候选：count 张互不相同、未满级的卡，按波次稀有度权重抽取。
 * 池不够时返回更少。epic 第 5 波起才有正权重（早期自然只出普通/稀有）。 */
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
  if (level >= MAX_CHAR_LEVEL) return { level, maxed: true, cur: 0, need: 0, ratio: 1 }
  const prev = level === 1 ? 0 : CHAR_XP_THRESHOLDS[level - 2]!
  const next = CHAR_XP_THRESHOLDS[level - 1]!
  const cur = xp - prev
  const need = next - prev
  return { level, maxed: false, cur, need, ratio: Math.max(0, Math.min(1, cur / need)) }
}
