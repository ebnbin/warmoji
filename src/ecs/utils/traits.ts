import { addComponent, hasComponent, removeComponent } from 'bitecs'
import { Anchored, Phasing, Span, Traits } from '../components'
import type { UnitTrait } from '../../types/enemies'
import type { EcsWorld } from '../world'

const BIT: Readonly<Record<UnitTrait, number>> = { swims: 1, breathes: 2, phases: 4, fireproof: 8, coldproof: 16, anchored: 32, wary: 64 }

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

/** 身体此刻有没有这个特质：flies 看身段，脚下那层离了地；推不动、穿墙看身上挂没挂着（变形时会暂时卸下锚定） */
export function hasTrait(world: EcsWorld, eid: number, t: UnitTrait | 'flies'): boolean {
  if (t === 'flies') return Span.lo[eid]! > 0
  if (t === 'anchored') return hasComponent(world, eid, Anchored)
  if (t === 'phases') return hasComponent(world, eid, Phasing)
  return hasComponent(world, eid, Traits) && (Traits.v[eid]! & BIT[t]) !== 0
}
