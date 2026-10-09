import type itemsJson from '../assets/items.json'
import type { Cond, ShapeKind } from './abilityDefs'
import type { StatMods } from './stats'

export interface Economy {
  readonly price: {
    readonly perWave: number
    readonly earlyDiscount: number
    readonly earlyFadeWaves: number
  }
  /** shelf 是开局时货架有几格；刷新价随刚打完的波次涨：base 定底价，step 定每刷一次的涨幅 */
  readonly shop: { readonly shelf: number; readonly reroll: { readonly base: number; readonly step: number } }
}
export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary'
/** 角色的打法：出手方式、伤害形态、会不会治疗，外加用到的攻击形状 */
export type Trait = 'melee' | 'ranged' | 'area' | 'dot' | 'summon' | 'heal' | ShapeKind
/** 可计数的条件：身边的敌人数、本波过了几个 everyMs、连续几个 everyMs 没受伤、场上倒下的队员数、场上除自己外站着的队员数 */
export type GearCount =
  | { readonly kind: 'foesNear'; readonly radius: number }
  | { readonly kind: 'waveTime'; readonly everyMs: number }
  | { readonly kind: 'unhurt'; readonly everyMs: number }
  | { readonly kind: 'alliesDown' }
  | { readonly kind: 'alliesUp' }
/** 条件属性：满足 if 时加一份 stats；按 count 数到几就叠几份（倍率按涨跌线性叠加），最多 max 份 */
export type GearWhen = { readonly if: Cond; readonly stats: StatMods } | { readonly count: GearCount; readonly stats: StatMods; readonly max: number }
/**
 * 一件道具：买下挂在队伍上，场上每个人都吃到，换人也不受影响；经济与全场类的属性全队只算一次。
 * maxStacks 是全队最多持有几件，1 是唯一，不写不限；for 是只对带其中一种打法的角色有用，不写对谁都有用
 */
export interface ItemDef {
  readonly emoji: string
  readonly name: string
  readonly rarity: ItemRarity
  readonly price: number
  readonly maxStacks?: number
  readonly for?: readonly Trait[]
  readonly stats?: StatMods
  readonly when?: readonly GearWhen[]
}
export type ItemId = keyof typeof itemsJson
