import cardsJson from '../assets/cards.json'
import type { ItemRarity, TeamEffects } from './items'

export type CardTag =
  | 'economy'
  | 'tempo'
  | 'offense'
  | 'defense'
  | 'meta'
  | 'skill'
  | 'loot'
  | 'trade'
  | 'curse'
export interface CardDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly rarity: ItemRarity
  readonly tags: readonly CardTag[]
  /** 可叠加/升级的上限（1 = 唯一）；每一级把 effects 再叠加一次 */
  readonly maxLevel: number
  readonly effects: Partial<TeamEffects>
}
// 卡表：数据行在 defs/cards.ts（创作层），npm run gen 校验并生成 cards.json
export type CardId = keyof typeof cardsJson
