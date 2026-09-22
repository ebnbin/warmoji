import cardsJson from '../assets/cards.json'
import { foldTeamEffects } from './items'
import type { TeamEffects } from '../types/items'
import type { CardDef, CardId } from '../types/cards'

export const CARDS = cardsJson as unknown as Record<CardId, CardDef>
export const CARD_IDS = Object.keys(CARDS) as readonly CardId[]
const CARD_MAP = CARDS as Record<string, CardDef>

export function aggregateTeamCards(owned: Readonly<Record<string, number>>): TeamEffects {
  const parts: Partial<TeamEffects>[] = []
  for (const [id, level] of Object.entries(owned)) {
    const card = CARD_MAP[id]
    if (!card) continue
    const lv = Math.min(level ?? 0, card.maxLevel)
    for (let i = 0; i < lv; i++) parts.push(card.effects)
  }
  return foldTeamEffects(parts)
}

