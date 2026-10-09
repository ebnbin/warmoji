import { hasComponent } from 'bitecs'
import { Motion, MOTION, Span } from '../components'
import { LIFT_PER_M } from '../../util/units'
import { LAYER_M } from './pass'
import type { EcsWorld } from '../world'

/** 悬空的身体在画面上抬起多少像素：底层离地多高就抬多高 */
export function hoverPx(eid: number): number {
  return Span.lo[eid]! * LAYER_M * LIFT_PER_M
}

/** 弧线与悬空把身体在画面上抬起来，脚还落在原处的地上；扑刺只是贴着地往前冲 */
export function lifted(world: EcsWorld, eid: number): boolean {
  return Span.lo[eid]! > 0 || (hasComponent(world, eid, Motion) && Motion.kind[eid] === MOTION.arc)
}
