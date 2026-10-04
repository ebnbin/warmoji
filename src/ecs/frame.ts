import { FRAME_U, UNIT } from '../util/units.ts'
import type { Rect } from './lens'
import type { Point } from '../util/vec'

/** 沙盒地图的方框，像素：左上角是世界原点 */
export const FRAME: Rect = { x: 0, y: 0, w: FRAME_U * UNIT, h: FRAME_U * UNIT }

/** 方框正中，像素：队伍在这里出生 */
export const FRAME_MID: Point = { x: FRAME.w / 2, y: FRAME.h / 2 }

/** 摆在方框正中、wU × hU 格的地图矩形，像素 */
export function centered(wU: number, hU: number): Rect {
  return { x: FRAME_MID.x - (wU * UNIT) / 2, y: FRAME_MID.y - (hU * UNIT) / 2, w: wU * UNIT, h: hU * UNIT }
}
