import { addComponent, hasComponent, removeComponent } from 'bitecs'
import { Anchored, Elem, Phasing, Span, Traits } from '../components'
import { EL } from '../../data/elements'
import type { UnitTrait } from '../../types/enemies'
import type { EcsWorld } from '../world'

const BIT: Readonly<Record<UnitTrait, number>> = { swims: 1, breathes: 2, phases: 4, fireproof: 8, coldproof: 16, anchored: 32, wary: 64 }

/** 本身是哪种元素就天生带着哪条特质：火耐火、冰耐寒、水会游泳 */
const BY_ELEMENT: Readonly<Partial<Record<UnitTrait, number>>> = { fireproof: EL.fire, coldproof: EL.ice, swims: EL.water }

function toggle(world: EcsWorld, eid: number, comp: object, on: boolean): void {
  if (on && !hasComponent(world, eid, comp)) addComponent(world, eid, comp)
  if (!on && hasComponent(world, eid, comp)) removeComponent(world, eid, comp)
}

/** 给身体换上这一套特质：推不动的挂上 Anchored、穿墙的挂上 Phasing，其余记在位上 */
export function setTraits(world: EcsWorld, eid: number, traits: readonly UnitTrait[] | undefined): void {
  const list = traits ?? []
  addComponent(world, eid, Traits)
  Traits.v[eid] = list.reduce((bits, t) => bits | BIT[t], 0)
  toggle(world, eid, Anchored, list.includes('anchored'))
  toggle(world, eid, Phasing, list.includes('phases'))
}

/** 身体此刻有没有这个特质：flies 看身段，脚下那层离了地；推不动、穿墙看身上挂没挂着（变形时会暂时卸下锚定）；其余看写了的与本身的元素 */
export function hasTrait(world: EcsWorld, eid: number, t: UnitTrait | 'flies'): boolean {
  if (t === 'flies') return Span.lo[eid]! > 0
  if (t === 'anchored') return hasComponent(world, eid, Anchored)
  if (t === 'phases') return hasComponent(world, eid, Phasing)
  return hasComponent(world, eid, Traits) && ((Traits.v[eid]! & BIT[t]) !== 0 || Elem.v[eid] === BY_ELEMENT[t])
}
