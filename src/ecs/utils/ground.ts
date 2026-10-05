import { hasComponent } from 'bitecs'
import { Motion, MOTION, Span, Transform, VisOff } from '../components'
import { EMOJI_BOX } from '../../emoji/pack'
import { EMOJI_PAD } from '../../emoji/svg'
import { LIFT_PER_M } from '../../util/units'
import { LAYER_M } from './pass'
import type { EcsWorld } from '../world'

/** 精灵的高里 emoji 画框占的份额：四周垫了 EMOJI_PAD */
export const ART = EMOJI_BOX / (EMOJI_BOX + 2 * EMOJI_PAD)

/** 精灵的中心落在 y 时，画框下沿的画面纵坐标 */
export function bottomAt(eid: number, y: number): number {
  return y + (Transform.h[eid]! * ART) / 2
}

/** 悬空的身体在画面上抬起多少像素：底层离地多高就抬多高 */
export function hoverPx(eid: number): number {
  return Span.lo[eid]! * LAYER_M * LIFT_PER_M
}

/** 弧线与悬空把身体在画面上抬起来，脚还落在原处的地上；扑刺只是贴着地往前冲 */
export function lifted(world: EcsWorld, eid: number): boolean {
  return Span.lo[eid]! > 0 || (hasComponent(world, eid, Motion) && Motion.kind[eid] === MOTION.arc)
}

/** 身体的脚落在地上的画面纵坐标：画框的下沿，身体抬起时算原处的地 */
export function footY(world: EcsWorld, eid: number): number {
  return bottomAt(eid, Transform.y[eid]! + (lifted(world, eid) ? 0 : VisOff.y[eid]!))
}
