import itemsJson from '../assets/items.json'
import economyJson from '../assets/economy.json'
import { fromJson } from './json'
import { keysOf } from '../util/record'
import type { CharacterEffects, Economy, ItemRarity, ItemDef, ItemId } from '../types/items'
import type { AbilityDef, Shape } from '../types/abilityDefs'

const ECON = fromJson<Economy>(economyJson)

export const CRIT_MUL = ECON.critMul

export const RARITY_ORDER: readonly ItemRarity[] = ['common', 'rare', 'epic']
export const RARITIES: Record<ItemRarity, { label: string; color: string }> = {
  common: { label: '普通', color: '#c8c8d4' },
  rare: { label: '稀有', color: '#4fc3f7' },
  epic: { label: '史诗', color: '#ce93d8' },
}

export const ITEMS = fromJson<Record<ItemId, ItemDef>>(itemsJson)

export const ITEM_IDS: readonly ItemId[] = keysOf(ITEMS)

export function characterXp(owned: readonly ItemId[]): number {
  let xp = 0
  for (const id of owned) xp += ITEMS[id].upgradeXp
  return xp
}

const PRICE = ECON.price

export function itemPrice(id: ItemId, wave: number): number {
  const inflate = 1 + PRICE.perWave * Math.max(0, wave - 1)
  const disc = 1 - PRICE.earlyDiscount * Math.max(0, 1 - Math.max(0, wave - 1) / PRICE.earlyFadeWaves)
  return Math.max(1, Math.round(ITEMS[id].price * inflate * disc))
}

export function aggregateCharacterEffects(
  owned: readonly ItemId[],
  extra: readonly Partial<CharacterEffects>[] = [],
): CharacterEffects {
  const fx: CharacterEffects = {
    hpAdd: 0,
    damageMul: 1,
    cooldownMul: 1,
    rangeMul: 1,
    projSpeedMul: 1,
    iframesAddMs: 0,
    reviveAddMs: 0,
    regenPerSec: 0,
    thorns: 0,
    killHeal: 0,
    critChance: 0,
    knockbackMul: 1,
  }
  const apply = (e: Partial<CharacterEffects>): void => {
    fx.hpAdd += e.hpAdd ?? 0
    fx.damageMul *= e.damageMul ?? 1
    fx.cooldownMul *= e.cooldownMul ?? 1
    fx.rangeMul *= e.rangeMul ?? 1
    fx.projSpeedMul *= e.projSpeedMul ?? 1
    fx.iframesAddMs += e.iframesAddMs ?? 0
    fx.reviveAddMs += e.reviveAddMs ?? 0
    fx.regenPerSec += e.regenPerSec ?? 0
    fx.thorns += e.thorns ?? 0
    fx.killHeal += e.killHeal ?? 0
    fx.critChance += e.critChance ?? 0
    fx.knockbackMul *= e.knockbackMul ?? 1
  }
  for (const id of owned) apply(ITEMS[id].effects)
  for (const e of extra) apply(e)
  fx.critChance = Math.min(0.5, fx.critChance)
  return fx
}


/** 只缩放形状的空间参数、索敌距离与弹速；伤害/冷却由运行时倍率处理，此处不得再乘 */
export function resolveAbilityDef(w: AbilityDef, fx: CharacterEffects): AbilityDef {
  const r = fx.rangeMul
  const v = fx.projSpeedMul
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
