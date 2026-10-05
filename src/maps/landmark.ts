import { UNIT } from '../util/units.ts'
import { roomAt } from './basin.ts'
import type { Basin } from './basin'

/** 地图给的一处地标，像素：位置、口子的半径，与朝场地里的单位方向（场地中间的地标为零） */
export interface Landmark {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly nx: number
  readonly ny: number
}

/** 落点离壁至少这么远，格；大的身体按它自己的半径 */
const LANDING_ROOM_U = 0.5

/** 半径 radius 像素的身体落在这片地面上的这一点站得下 */
export function roomFor(b: Basin, x: number, y: number, radius: number): boolean {
  return roomAt(b, x, y) >= Math.max(LANDING_ROOM_U * UNIT, radius)
}
