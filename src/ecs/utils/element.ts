import { hasComponent } from 'bitecs'
import { AURA_MS, ELEMENTS, ELEMENT_IDS, elementIndex, reactionOf } from '../../data/elements'
import { Elem, Mark, MARK, MARK_SLOTS, TAG } from '../components'
import { addMark, markSlot } from './marks'
import type { AbilityDef } from '../../types/abilityDefs'
import type { ElementReaction } from '../../types/elements'
import type { Sim } from '../sim'

/** 各元素附着时的标记种类，按元素编号；反查表按标记种类给元素编号 */
const AURA_MARK = [0, ...ELEMENT_IDS.map((id) => MARK[ELEMENTS[id].aura])]
const AURA_OF = new Uint8Array(256)
AURA_MARK.forEach((kind, i) => {
  if (i > 0) AURA_OF[kind] = i
})

/** 身体此刻的元素：转了属就是转的，否则自己的；0 是无元素 */
export function elementNow(sim: Sim, eid: number): number {
  const s = hasComponent(sim.world, eid, Mark) ? markSlot(sim, eid, MARK.attuned) : -1
  return s >= 0 ? Mark.a[s]! : Elem.v[eid]!
}

/** 身体出手带的元素：附了魔就是附的，否则能力写的，否则身体此刻的；0 是无元素 */
export function strikeElement(sim: Sim, def: AbilityDef | undefined, body: number): number {
  const imbue = hasComponent(sim.world, body, Mark) ? markSlot(sim, body, MARK.imbue) : -1
  if (imbue >= 0) return Mark.a[imbue]!
  return def?.element !== undefined ? elementIndex(def.element) : elementNow(sim, body)
}

/** 带元素的一下落在身上：附着着能和它起反应的就消耗附着、返回反应；否则附着上这一种，换掉原来的 */
export function touchElement(sim: Sim, target: number, el: number): ElementReaction | undefined {
  if (!hasComponent(sim.world, target, Mark)) return undefined
  const now = sim.elapsedMs
  for (let s = target * MARK_SLOTS; s < (target + 1) * MARK_SLOTS; s++) {
    const cur = AURA_OF[Mark.kind[s]!]!
    if (cur === 0 || Mark.until[s]! <= now) continue
    const r = reactionOf(cur, el)
    if (r || cur !== el) Mark.kind[s] = MARK.none
    if (r) return r
    break
  }
  addMark(target, AURA_MARK[el]!, TAG.effect, now + AURA_MS, 0)
  return undefined
}
