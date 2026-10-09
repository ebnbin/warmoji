import { Transform, VisOff } from '../components'
import { lifted } from '../utils/ground'
import { EMOJI_VENDOR } from '../../emoji/vendor'
import { vendorBox } from '../../emoji/vendors'
import type { EcsWorld } from '../world'

const BOX_H = vendorBox(EMOJI_VENDOR).h

/** 精灵的高里 emoji 画框占的份额：四周垫了画风的留白 */
const ART = BOX_H / (BOX_H + 2 * EMOJI_VENDOR.padding)

/** 精灵的中心落在 y 时，画框下沿的画面纵坐标 */
export function bottomAt(eid: number, y: number): number {
  return y + (Transform.h[eid]! * ART) / 2
}

/** 身体的脚落在地上的画面纵坐标：画框的下沿，身体抬起时算原处的地 */
export function footY(world: EcsWorld, eid: number): number {
  return bottomAt(eid, Transform.y[eid]! + (lifted(world, eid) ? 0 : VisOff.y[eid]!))
}
