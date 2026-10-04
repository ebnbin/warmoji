import { hasComponent } from 'bitecs'
import { Airborne, Motion, MOTION, Transform, VisOff } from '../components'
import { EMOJI_BOX } from '../../emoji/pack'
import { EMOJI_PAD } from '../../emoji/svg'
import type { EcsWorld } from '../world'

/** 精灵的高里 emoji 画框占的份额：四周垫了 EMOJI_PAD */
export const ART = EMOJI_BOX / (EMOJI_BOX + 2 * EMOJI_PAD)

/** 弧线与悬空把身体在画面上抬起来，脚还落在原处的地上；扑刺只是贴着地往前冲 */
export function lifted(world: EcsWorld, eid: number): boolean {
  return hasComponent(world, eid, Airborne) || (hasComponent(world, eid, Motion) && Motion.kind[eid] === MOTION.arc)
}

/** 身体的脚落在地上的画面纵坐标：画框的下沿，身体抬起时算原处的地 */
export function footY(world: EcsWorld, eid: number): number {
  return Transform.y[eid]! + (lifted(world, eid) ? 0 : VisOff.y[eid]!) + (Transform.h[eid]! * ART) / 2
}
