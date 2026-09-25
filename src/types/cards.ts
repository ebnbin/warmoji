import cardsJson from '../assets/cards.json'
import type { ItemRarity, TeamEffects } from './items'

type CardTag =
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
  readonly maxLevel: number
  readonly effects: Partial<TeamEffects>
}
export type CardId = keyof typeof cardsJson
