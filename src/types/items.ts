import itemsJson from '../assets/items.json'
import type { AbilityDef } from './abilityDefs'

export interface CharacterEffects {
  hpAdd: number
  damageMul: number
  cooldownMul: number
  /** 触及/半径/射程/爆炸半径的统一倍率 */
  rangeMul: number
  projSpeedMul: number
  iframesAddMs: number
  reviveAddMs: number
  /** 加法叠加 */
  regenPerSec: number
  /** 加法叠加；仅接触，不含敌弹 */
  thorns: number
  /** 加法叠加 */
  killHeal: number
  /** 加法叠加，封顶 0.5 */
  critChance: number
  /** 乘法叠乘 */
  knockbackMul: number
}
export interface TeamEffects {
  moveSpeedMul: number
  magnetMul: number
  /** 加法叠加，封顶 0.9 */
  doubleCoinChance: number
  teamDamageMul: number
  /** 乘法叠乘，再与队长 xpGainMul 相乘 */
  xpGainMul: number
  /** 乘法叠乘，保底 0.6 */
  enemySlowMul: number
  /** 波末回复生命上限的比例；加法叠加，封顶 0.6 */
  waveHealRatio: number
  /** 加法叠加 */
  waveCoins: number
  /** 乘法叠乘 */
  teamCooldownMul: number
  /** 加法，与角色暴击相加后封顶 0.5 */
  critAdd: number
  /** 乘法叠乘 */
  teamHpMul: number
  /** 乘法叠乘，保底 0.3 */
  reviveMul: number
  /** 乘法叠乘，保底 0.3 */
  skillCdMul: number
  /** 乘法叠乘，保底 0.4 */
  shopDiscountMul: number
  /** 加法 */
  freeRerolls: number
  /** 加法；候选数 = 3 + draftSize */
  draftSize: number
}
export interface Economy {
  readonly critMul: number
  /** perWave 每波通胀；earlyDiscount 前期折扣，至 earlyFadeWaves 波线性消退 */
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
  /** 缺省无限 */
  readonly maxStacks?: number
  readonly pool: ItemPool
  /** 购买即累加给该角色的专属经验 */
  readonly upgradeXp: number
  /** 缺省 1 */
  readonly minLevel?: 1 | 2 | 3
  readonly effects: Partial<CharacterEffects>
}
export type ItemId = keyof typeof itemsJson
