import { hasComponent } from 'bitecs'
import { EL, elementIndex } from '../../data/elements'
import { Elem, Mark, MARK } from '../components'
import { hasMark, markSlot } from './marks'
import { hasTrait } from './traits'
import type { AbilityDef } from '../../types/abilityDefs'
import type { Sim } from '../sim'

/** 身体此刻的元素：转了属就是转的，否则自己的；0 是无元素 */
export function elementNow(sim: Sim, eid: number): number {
  const s = hasComponent(sim.world, eid, Mark) ? markSlot(sim, eid, MARK.attuned) : -1
  return s >= 0 ? Mark.a[s]! : Elem.v[eid]!
}

/** 身体出手带的元素：附了魔就是附的，否则能力写的，否则身体此刻的；0 是无元素，就是物理 */
export function strikeElement(sim: Sim, def: AbilityDef | undefined, body: number): number {
  const imbue = hasComponent(sim.world, body, Mark) ? markSlot(sim, body, MARK.imbue) : -1
  if (imbue >= 0) return Mark.a[imbue]!
  if (def?.element === 'physical') return 0
  return def?.element !== undefined ? elementIndex(def.element) : elementNow(sim, body)
}

function marked(sim: Sim, eid: number, kind: number): boolean {
  return hasComponent(sim.world, eid, Mark) && hasMark(sim, eid, kind)
}

/** 湿的：浇湿了、本身是水，或者泡在水里 */
export function isWet(sim: Sim, eid: number): boolean {
  return marked(sim, eid, MARK.wet) || elementNow(sim, eid) === EL.water || sim.hooks.soaks?.(sim, eid) === true
}

export function isBurning(sim: Sim, eid: number): boolean {
  return marked(sim, eid, MARK.burn)
}

export function isFrozen(sim: Sim, eid: number): boolean {
  return marked(sim, eid, MARK.frozen)
}

export function isChilled(sim: Sim, eid: number): boolean {
  return marked(sim, eid, MARK.chill)
}

/** 点不着：本身是火，或者耐火 */
export function burnProof(sim: Sim, eid: number): boolean {
  return elementNow(sim, eid) === EL.fire || hasTrait(sim.world, eid, 'fireproof')
}

/** 冻不住：本身是冰，或者耐寒 */
export function coldProof(sim: Sim, eid: number): boolean {
  return elementNow(sim, eid) === EL.ice || hasTrait(sim.world, eid, 'coldproof')
}

/** 不中毒：本身是毒 */
export function poisonProof(sim: Sim, eid: number): boolean {
  return elementNow(sim, eid) === EL.poison
}

/** 不受传导：本身是雷 */
export function shockProof(sim: Sim, eid: number): boolean {
  return elementNow(sim, eid) === EL.thunder
}
