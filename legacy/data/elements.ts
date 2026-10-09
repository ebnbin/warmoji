import elementsJson from '../assets/elements.json'
import { fromJson } from './json'
import { keysOf } from '../util/record'
import type { ElementDef, ElementId, ElementReaction, ElementRules } from '../types/elements'

const RULES = fromJson<Omit<ElementRules, 'list'> & { readonly list: Readonly<Record<ElementId, ElementDef>> }>(elementsJson)

export const ELEMENTS = RULES.list
export const ELEMENT_IDS: readonly ElementId[] = keysOf(RULES.list)
export const ELEMENT_MUL = RULES.mul
export const AURA_MS = RULES.auraMs
export const REACTIONS: readonly ElementReaction[] = Object.values(RULES.reactions)

/** 元素的编号：0 是无元素，其余按元素表的次序 */
export function elementIndex(id: ElementId | undefined): number {
  return id === undefined ? 0 : ELEMENT_IDS.indexOf(id) + 1
}

export function elementAt(i: number): ElementId | undefined {
  return i > 0 ? ELEMENT_IDS[i - 1] : undefined
}

const N = ELEMENT_IDS.length + 1

/** 克制倍率：按出手的与挨打的元素编号查 */
const COUNTER = new Float32Array(N * N).fill(1)
for (const a of ELEMENT_IDS) {
  for (const b of ELEMENT_IDS) {
    const k = elementIndex(a) * N + elementIndex(b)
    if (a === b) COUNTER[k] = RULES.mul.same
    else if (ELEMENTS[a].beats.includes(b)) COUNTER[k] = RULES.mul.strong
    else if (ELEMENTS[b].beats.includes(a)) COUNTER[k] = RULES.mul.weak
  }
}

export function counterMul(atk: number, def: number): number {
  return COUNTER[atk * N + def]!
}

/** 克制倍率按元素名查：图鉴用 */
export function counterOf(atk: ElementId, def: ElementId): number {
  return counterMul(elementIndex(atk), elementIndex(def))
}

/** 元素反应：按附着的与打中的元素编号查，两个顺序都算 */
const REACT: (ElementReaction | undefined)[] = Array.from({ length: N * N }, () => undefined)
for (const r of REACTIONS) {
  const a = elementIndex(r.of[0])
  const b = elementIndex(r.of[1])
  REACT[a * N + b] = r
  REACT[b * N + a] = r
}

export function reactionOf(aura: number, by: number): ElementReaction | undefined {
  return REACT[aura * N + by]
}
