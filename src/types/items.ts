import itemsJson from '../assets/items.json'
import type { AbilityDef } from './abilityDefs'

export interface CharacterEffects {
  hpAdd: number
  damageMul: number
  cooldownMul: number
  rangeMul: number
  projSpeedMul: number
  iframesAddMs: number
  reviveAddMs: number
  regenPerSec: number
  thorns: number
  killHeal: number
  critChance: number
  knockbackMul: number
}
export interface TeamEffects {
  moveSpeedMul: number
  magnetMul: number
  doubleCoinChance: number
  teamDamageMul: number
  xpGainMul: number
  enemySlowMul: number
  waveHealRatio: number
  waveCoins: number
  teamCooldownMul: number
  critAdd: number
  teamHpMul: number
  reviveMul: number
  skillCdMul: number
  shopDiscountMul: number
  freeRerolls: number
  draftSize: number
}
export interface Economy {
  readonly critMul: number
  readonly price: {
    readonly perWave: number
    readonly earlyDiscount: number
    readonly earlyFadeWaves: number
  }
  readonly shop: { readonly refreshPrice: number }
}
export type ItemRarity = 'common' | 'rare' | 'epic'
type ItemPool = 'all' | AbilityDef['kind']
export interface ItemDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly rarity: ItemRarity
  readonly price: number
  readonly maxStacks?: number
  readonly pool: ItemPool
  readonly upgradeXp: number
  readonly minLevel?: 1 | 2 | 3
  readonly effects: Partial<CharacterEffects>
}
export type ItemId = keyof typeof itemsJson
