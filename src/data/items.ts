import itemsJson from '../assets/items.json'
import economyJson from '../assets/economy.json'
import { fromJson } from './json'
import { keysOf } from '../util/record'
import { stackMods } from './stats'
import type { Economy, GrowthProgress, ItemRarity, ItemDef, ItemId } from '../types/items'
import type { StatMods, StatValues } from '../types/stats'
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

/** 买下这件道具给角色的经验 */
export function itemXp(def: ItemDef): number {
  return Math.round(def.price * ECON.xpPerCoin)
}

export function characterXp(owned: readonly ItemId[]): number {
  let xp = 0
  for (const id of owned) xp += itemXp(ITEMS[id])
  return xp
}

const PRICE = ECON.price

export function itemPrice(id: ItemId, wave: number): number {
  const inflate = 1 + PRICE.perWave * Math.max(0, wave - 1)
  const disc = 1 - PRICE.earlyDiscount * Math.max(0, 1 - Math.max(0, wave - 1) / PRICE.earlyFadeWaves)
  return Math.max(1, Math.round(ITEMS[id].price * inflate * disc))
}

/** 成长道具攒下的进度折成几份 */
export function growthSteps(id: ItemId, progress: number): number {
  const g = ITEMS[id].grow
  return g ? Math.floor(progress / (g.each === 'kills' ? g.count : 1)) : 0
}

/** 角色身上的常驻修正：买到的道具、本局攒下的成长与当前等级的成长 */
export function gearMods(owned: readonly ItemId[], level: readonly StatMods[], growth: GrowthProgress = {}): StatMods[] {
  const grown = keysOf(growth).flatMap((id) => {
    const g = ITEMS[id].grow
    const n = growthSteps(id, growth[id] ?? 0)
    return g && n > 0 ? [stackMods(g.stats, n)] : []
  })
  return [...owned.flatMap((id) => ITEMS[id].stats ?? []), ...grown, ...level]
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

export const SHOP = ECON.shop
