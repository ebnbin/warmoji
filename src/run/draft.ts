import { ITEMS, ITEM_IDS, RARITY_ORDER } from '../data/items'
import { abilityEffects, childAbilities, childEffects } from '../data/abilities'
import { loadoutFor } from '../data/characters'
import { CHAR_XP_THRESHOLDS, MAX_CHAR_LEVEL, characterLevel } from '../data/charLevel'
import { deliveryOf, HIT } from '../ecs/utils/hitTags'
import type { ItemDef, ItemId, ItemRarity, Trait } from '../types/items'
import type { AbilityDef, Effect } from '../types/abilityDefs'
import type { CharacterDef } from '../types/characters'
import type { LevelProgress } from '../types/charLevel'

/** 各稀有度的权重：随波次与等级升高，幸运按百分比放大普通以外的几率 */
function rarityWeights(wave: number, level: number, luck: number): Record<ItemRarity, number> {
  const lv = Math.max(0, level - 1)
  const up = Math.max(0, 1 + luck / 100)
  const rare = Math.min(0.5, 0.06 + 0.02 * wave + 0.14 * lv) * up
  const epicBase = wave < 5 ? 0 : Math.min(0.2, 0.025 * (wave - 4))
  const epic = Math.min(0.42, epicBase + 0.13 * lv + (lv > 0 ? 0.05 : 0)) * up
  const legendary = (wave < 8 ? 0 : Math.min(0.08, 0.01 * (wave - 7) + 0.02 * lv)) * up
  const common = Math.max(0.05, 1 - rare - epic - legendary)
  return { common, rare, epic, legendary }
}

/** 效果带来的打法记进 out，返回其中有没有吃出手方式的伤害 */
function effectTraits(list: readonly Effect[] | undefined, out: Set<Trait>): boolean {
  let struck = false
  for (const fx of list ?? []) {
    switch (fx.kind) {
      case 'damage':
        struck = true
        break
      case 'blast':
        out.add('area')
        struck = true
        break
      case 'spawnProjectile':
        out.add('ranged')
        break
      case 'poison':
      case 'devour':
        out.add('dot')
        break
      case 'ground':
        out.add('area')
        if (fx.def.damage > 0 && fx.def.tickMs > 0 && !fx.def.trap) out.add('dot')
        break
      case 'heal':
        out.add('heal')
        break
      case 'summon':
        if (fx.of !== 'victim') out.add('summon')
        break
      default:
        break
    }
    for (const sub of childEffects(fx)) struck = effectTraits(sub, out) || struck
  }
  return struck
}

/** 一条能力带来的打法：形状本身、伤害吃哪些加成、会不会治疗与召唤 */
function abilityTraits(a: AbilityDef, out: Set<Trait>): void {
  const s = a.shape
  out.add(s.kind)
  const direct = (a.damage ?? 0) > 0
  let struck = direct
  for (const list of abilityEffects(a)) struck = effectTraits(list, out) || struck
  switch (s.kind) {
    case 'summon':
    case 'emplace':
      out.add('summon')
      break
    case 'zone':
      if (s.mend) out.add('heal')
      if (direct) out.add('area')
      if (direct && s.tickMs && !s.trap) out.add('dot')
      break
    case 'disc':
      if (direct && s.of !== 'hurt') out.add('area')
      break
    case 'all':
    case 'leap':
      if (direct) out.add('area')
      break
    default:
      break
  }
  const how = s.kind === 'summon' || !struck ? 0 : deliveryOf(a)
  if (how === HIT.melee) out.add('melee')
  if (how === HIT.ranged) out.add('ranged')
  for (const c of childAbilities(a)) abilityTraits(c, out)
}

/** 角色这个等级的打法：看普通出手（含各形态的），治疗还看主动技能 */
export function characterTraits(def: CharacterDef, level: number): ReadonlySet<Trait> {
  const out = new Set<Trait>()
  for (const a of loadoutFor(def, level)) abilityTraits(a, out)
  for (const f of def.forms ?? []) for (const a of f.abilities ?? []) abilityTraits(a, out)
  const skill = new Set<Trait>()
  abilityTraits(def.skill.ability, skill)
  if (skill.has('heal')) out.add('heal')
  return out
}

export function characterPoolFor(def: CharacterDef, level: number): ItemId[] {
  const traits = characterTraits(def, level)
  return ITEM_IDS.filter((iid) => {
    const item: ItemDef = ITEMS[iid]
    if ((item.minLevel ?? 1) > level) return false
    return item.for === undefined || item.for.some((t) => traits.has(t))
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
  luck = 0,
): ItemId | null {
  const avail = pool.filter((id) => !reachedStackLimit(owned, id))
  if (avail.length === 0) return null
  const weights = rarityWeights(wave, level, luck)
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

/** 攒了 xp 经验、等级在 floor 到 top 之间的角色往上一级的进度：到了 top 算满，停在 floor 上时从 0 经验算起 */
export function levelProgress(xp: number, floor = 1, top = MAX_CHAR_LEVEL): LevelProgress {
  const level = Math.min(top, Math.max(floor, characterLevel(xp)))
  if (level >= top) return { maxed: true, cur: 0, need: 0, ratio: 1 }
  const prev = level > floor ? CHAR_XP_THRESHOLDS[level - 2]! : 0
  const next = CHAR_XP_THRESHOLDS[level - 1]!
  const cur = xp - prev
  const need = next - prev
  return { maxed: false, cur, need, ratio: Math.max(0, Math.min(1, cur / need)) }
}
