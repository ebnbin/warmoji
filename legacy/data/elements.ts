import elementsJson from '../assets/elements.json'
import { fromJson } from './json'
import { keysOf } from '../util/record'
import { UNIT } from '../util/units'
import type { ElementDef, ElementId, ElementReaction, ElementRules, ReactionId } from '../types/elements'

const RULES = fromJson<Omit<ElementRules, 'list'> & { readonly list: Readonly<Record<ElementId, ElementDef>> }>(elementsJson)

/** 整套规则，长度按格：图鉴照着它写 */
export const ELEMENT_RULES = RULES
export const ELEMENTS = RULES.list
export const ELEMENT_IDS: readonly ElementId[] = keysOf(RULES.list)

/** 元素的编号：0 是无元素（物理），其余按元素表的次序 */
export function elementIndex(id: ElementId | undefined): number {
  return id === undefined ? 0 : ELEMENT_IDS.indexOf(id) + 1
}

export function elementAt(i: number): ElementId | undefined {
  return i > 0 ? ELEMENT_IDS[i - 1] : undefined
}

/** 各元素的编号，按名字取 */
export const EL: Readonly<Record<ElementId, number>> = Object.fromEntries(ELEMENT_IDS.map((id) => [id, elementIndex(id)])) as Record<ElementId, number>

export const BURN = { ...RULES.burn, spread: RULES.burn.spread * UNIT }
export const CHILL = RULES.chill
export const SHOCK = { ...RULES.shock, radius: RULES.shock.radius * UNIT }
export const WET_MS = RULES.wet.ms
export const POISON = RULES.poison

export const REACTION_IDS: readonly ReactionId[] = keysOf(RULES.reactions)
export const REACTIONS: readonly ElementReaction[] = REACTION_IDS.map((id) => RULES.reactions[id])
export const SHATTER = RULES.reactions.shatter
export const CONDUCT = { ...RULES.reactions.conduct, radius: RULES.reactions.conduct.radius * UNIT }
export const IGNITE = RULES.reactions.ignite

/** 反应的编号：事件与飘字按它查 */
export function reactionIndex(id: ReactionId): number {
  return REACTION_IDS.indexOf(id)
}
