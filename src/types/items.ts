import type itemsJson from '../assets/items.json'
import type { ShapeKind } from './abilityDefs'
import type { StatMods } from './stats'

export interface Economy {
  readonly price: {
    readonly perWave: number
    readonly earlyDiscount: number
    readonly earlyFadeWaves: number
  }
  readonly shop: { readonly refreshPrice: number }
  /** 买一件道具给角色的经验：原价乘它 */
  readonly xpPerCoin: number
}
export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary'
/** 角色的打法：出手方式、伤害形态、会不会治疗，外加用到的攻击形状 */
export type Trait = 'melee' | 'ranged' | 'area' | 'dot' | 'summon' | 'heal' | ShapeKind
export interface ItemDef {
  readonly emoji: string
  readonly name: string
  readonly rarity: ItemRarity
  readonly price: number
  /** 最多持有几件，1 是唯一；不写不限 */
  readonly maxStacks?: number
  /** 只刷给带其中一种打法的角色；不写谁都刷得到 */
  readonly for?: readonly Trait[]
  readonly minLevel?: 1 | 2 | 3
  readonly stats?: StatMods
}
export type ItemId = keyof typeof itemsJson
