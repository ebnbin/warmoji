import { CARDS as CARD_TABLE } from '../../defs/cards'
import { keysOf } from '../util/record'
import { foldTeamEffects } from './items'
import type { TeamEffects } from '../types/items'
import type { CardDef, CardId } from '../types/cards'

export const CARDS: Record<CardId, CardDef> = CARD_TABLE
export const CARD_IDS: readonly CardId[] = keysOf(CARDS)

export function aggregateTeamCards(owned: Readonly<Partial<Record<CardId, number>>>): TeamEffects {
  const parts: Partial<TeamEffects>[] = []
  for (const id of keysOf(owned)) {
    const card = CARDS[id]
    const lv = Math.min(owned[id] ?? 0, card.maxLevel)
    for (let i = 0; i < lv; i++) parts.push(card.effects)
  }
  return foldTeamEffects(parts)
}

