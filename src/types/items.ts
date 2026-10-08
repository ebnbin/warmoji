import type itemsJson from '../assets/items.json'
import type { AbilityDef, Cond, Reaction, ShapeKind } from './abilityDefs'
import type { StatMods } from './stats'

export interface Economy {
  readonly price: {
    readonly perWave: number
    readonly earlyDiscount: number
    readonly earlyFadeWaves: number
  }
  /** 刷新价随刚打完的波次涨：base 定底价，step 定每刷一次的涨幅 */
  readonly shop: { readonly reroll: { readonly base: number; readonly step: number } }
  /** 买一件道具给角色的经验：原价乘它 */
  readonly xpPerCoin: number
}
export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary'
/** 角色的打法：出手方式、伤害形态、会不会治疗，外加用到的攻击形状 */
export type Trait = 'melee' | 'ranged' | 'area' | 'dot' | 'summon' | 'heal' | ShapeKind
/** 可计数的条件：身边的敌人数、本波过了几个 everyMs、连续几个 everyMs 没受伤 */
export type GearCount =
  | { readonly kind: 'foesNear'; readonly radius: number }
  | { readonly kind: 'waveTime'; readonly everyMs: number }
  | { readonly kind: 'unhurt'; readonly everyMs: number }
/** 条件属性：满足 if 时加一份 stats；按 count 数到几就叠几份（倍率按涨跌线性叠加），最多 max 份 */
export type GearWhen = { readonly if: Cond; readonly stats: StatMods } | { readonly count: GearCount; readonly stats: StatMods; readonly max: number }
/** 道具的反应：wave 是每波开始，残血与致命每条命各一次，这三种不带几率 */
export type ItemReaction = Extract<Reaction, { readonly on: 'hit' | 'crit' | 'dodge' | 'hurt' | 'kill' | 'skill' | 'wave' | 'lethal' | 'lowHp' }>
export type ItemEvent = ItemReaction['on']
/** 本局成长：每波结束、或这名角色每击杀 count 个敌人，永久多一份 stats（按份数线性叠加） */
export type GearGrow = { readonly each: 'wave'; readonly stats: StatMods } | { readonly each: 'kills'; readonly count: number; readonly stats: StatMods }
/** 每人每件成长道具攒下的进度：每波结束按件数加，击杀成长按件数乘击杀数加 */
export type GrowthProgress = Partial<Record<ItemId, number>>
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
  readonly when?: readonly GearWhen[]
  readonly reactions?: readonly ItemReaction[]
  /** 附带的装置：按自己的冷却自动出手，吃持有者的属性 */
  readonly ability?: AbilityDef
  readonly grow?: GearGrow
}
export type ItemId = keyof typeof itemsJson
