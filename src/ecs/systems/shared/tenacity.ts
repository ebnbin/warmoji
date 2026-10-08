import { addComponent, hasComponent } from 'bitecs'
import { Tenacity } from '../../components'
import type { Tenacity as TenacityDef } from '../../../types/enemies'
import type { EcsWorld } from '../../world'

/** 头目与精英出生时挂上控制韧性 */
export function attachTenacity(world: EcsWorld, eid: number, def: TenacityDef): void {
  addComponent(world, eid, Tenacity)
  Tenacity.ms[eid] = 0
  Tenacity.fill[eid] = def.fillMs
  Tenacity.hold[eid] = def.steadfastMs
}

/** 往韧性条里记一段控制，没有韧性的身体不记 */
export function bumpTenacity(world: EcsWorld, eid: number, ms: number): void {
  if (hasComponent(world, eid, Tenacity)) Tenacity.ms[eid] = Tenacity.ms[eid]! + ms
}

/** 韧性条满了多少，0 到 1；没有韧性的是 0 */
export function tenacityRatio(world: EcsWorld, eid: number): number {
  return hasComponent(world, eid, Tenacity) ? Math.min(1, Tenacity.ms[eid]! / Tenacity.fill[eid]!) : 0
}
