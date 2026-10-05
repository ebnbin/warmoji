import { FRAME_U, SAFE_U, UNIT } from '../util/units.ts'
import type { Point } from '../util/vec'

/** 世界里的一块矩形，像素 */
export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** 沙盒地图的方框，像素：左上角是世界原点 */
export const FRAME: Rect = { x: 0, y: 0, w: FRAME_U * UNIT, h: FRAME_U * UNIT }

/** 方框里的安全区，像素：能走的地方与地图的边都在这里面 */
export const SAFE: Rect = { x: SAFE_U * UNIT, y: SAFE_U * UNIT, w: (FRAME_U - SAFE_U * 2) * UNIT, h: (FRAME_U - SAFE_U * 2) * UNIT }

/** 方框正中，像素：队伍在这里出生 */
export const FRAME_MID: Point = { x: FRAME.w / 2, y: FRAME.h / 2 }

/** 摆在方框正中、wU × hU 格的地图矩形，像素 */
export function centered(wU: number, hU: number): Rect {
  return { x: FRAME_MID.x - (wU * UNIT) / 2, y: FRAME_MID.y - (hU * UNIT) / 2, w: wU * UNIT, h: hU * UNIT }
}
