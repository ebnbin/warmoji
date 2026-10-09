import itemsJson from '../assets/items.json'
import economyJson from '../assets/economy.json'
import { fromJson } from './json'
import { keysOf } from '../util/record'
import { foldStats, STATS } from './stats'
import type { Economy, ItemRarity, ItemDef, ItemId } from '../types/items'
import type { StatBase, StatKey, StatMods, StatValues } from '../types/stats'
import type { AbilityDef, Shape } from '../types/abilityDefs'
import type { Tone } from '../ui/theme'

const ECON = fromJson<Economy>(economyJson)

export const RARITY_ORDER: readonly ItemRarity[] = ['common', 'rare', 'epic', 'legendary']
export const RARITIES: Record<ItemRarity, { label: string; tone: Tone }> = {
  common: { label: '普通', tone: 'steel' },
  rare: { label: '稀有', tone: 'info' },
  epic: { label: '史诗', tone: 'epic' },
  legendary: { label: '传说', tone: 'warn' },
}

export const ITEMS = fromJson<Record<ItemId, ItemDef>>(itemsJson)

export const ITEM_IDS: readonly ItemId[] = keysOf(ITEMS)

const PRICE = ECON.price

export function itemPrice(id: ItemId, wave: number): number {
  const inflate = 1 + PRICE.perWave * Math.max(0, wave - 1)
  const disc = 1 - PRICE.earlyDiscount * Math.max(0, 1 - Math.max(0, wave - 1) / PRICE.earlyFadeWaves)
  return Math.max(1, Math.round(ITEMS[id].price * inflate * disc))
}

/** 全队只算一次的属性：经济与全场类，不进各人的属性表 */
export function teamOnce(k: StatKey): boolean {
  const c = STATS[k].category
  return c === 'economy' || c === 'field'
}

/** 修正里只留 keep 认的属性 */
function only(m: StatMods, keep: (k: StatKey) => boolean): StatMods {
  const pick = (r: StatBase | undefined): StatBase => Object.fromEntries(Object.entries(r ?? {}).filter(([k]) => keep(k as StatKey)))
  return { add: pick(m.add), pct: pick(m.pct), mul: pick(m.mul) }
}

/** 一名队员身上的常驻修正：队伍道具里各人各算的属性，加上他这一级的 */
export function gearMods(owned: readonly ItemId[], level: readonly StatMods[]): StatMods[] {
  return [...owned.flatMap((id) => (ITEMS[id].stats ? [only(ITEMS[id].stats, (k) => !teamOnce(k))] : [])), ...level]
}

/** 队伍道具里全队只算一次的属性：经济与全场类，其余取默认值 */
export function teamStats(owned: readonly ItemId[]): StatValues {
  return foldStats(undefined, owned.flatMap((id) => (ITEMS[id].stats ? [only(ITEMS[id].stats, teamOnce)] : [])))
}

/** 只缩放形状的空间参数、索敌距离与弹速；伤害/冷却在结算时按属性表乘，此处不得再乘 */
export function resolveAbilityDef(w: AbilityDef, fx: Pick<StatValues, 'range' | 'projSpeed'>): AbilityDef {
  const r = fx.range
  const v = fx.projSpeed
  const s = w.shape
  let shape: Shape
  switch (s.kind) {
    case 'bolt':
      shape = { ...s, projectile: { ...s.projectile, speed: s.projectile.speed * v } }
      break
    case 'segment':
      shape = { ...s, reach: s.reach * r, radius: s.radius * r, ...(s.lungeDist === undefined ? {} : { lungeDist: s.lungeDist * r }) }
      break
    case 'sector':
    case 'disc':
    case 'zone':
      shape = { ...s, radius: s.radius * r }
      break
    case 'chain':
      shape = { ...s, hopRange: s.hopRange * r }
      break
    case 'flyer':
      shape = { ...s, range: s.range * r, radius: s.radius * r, returnSpeed: s.returnSpeed * r }
      break
    case 'summon':
      shape = { ...s, minion: { ...s.minion, speed: s.minion.speed * v } }
      break
    case 'emplace':
      shape = { ...s, ability: resolveAbilityDef(s.ability, fx) }
      break
    default:
      shape = s
  }
  return { ...w, shape, ...(w.range === undefined ? {} : { range: w.range * r }) }
}

/** 开局时货架有几格 */
export const SHELF = ECON.shop.shelf

/** 打完第 wave 波的商店里已经花钱刷新过 paid 次，下一次刷新的价格 */
export function rerollPrice(wave: number, paid: number): number {
  const { base, step } = ECON.shop.reroll
  const w = Math.max(1, wave)
  return Math.floor(w * base) + Math.max(1, Math.floor(w * step)) * (paid + 1)
}
