import { warpEnd } from './layout.ts'
import type { WarpSpot } from './layout'
import type { Point } from '../../util/vec'

/**
 * 线段 a→b（格）在两头门柱之间穿过门线的地方：走到的比例，没穿过为 −1。
 * 门线把地面分成负、正两侧（竖门是西、东，横门是北、南），正好压在门线上算在正的一侧
 */
export function warpCross(w: WarpSpot, len: number, post: number, ax: number, ay: number, bx: number, by: number): number {
  const sa = w.axis === 0 ? ax - w.x : ay - w.y
  const sb = w.axis === 0 ? bx - w.x : by - w.y
  if (sa < 0 === sb < 0) return -1
  const t = sa / (sa - sb)
  const along = w.axis === 0 ? ay + (by - ay) * t - w.y : ax + (bx - ax) * t - w.x
  return along > post && along < len - post ? t : -1
}

/** (x, y)（格）在门线的哪一侧：负侧为 −1，正侧（含压在门线上）为 1 */
export function warpSide(w: WarpSpot, x: number, y: number): -1 | 1 {
  return (w.axis === 0 ? x - w.x : y - w.y) < 0 ? -1 : 1
}

/** (x, y)（格）沿门线方向落在两头门柱之间 */
export function withinWarp(w: WarpSpot, len: number, x: number, y: number): boolean {
  const along = w.axis === 0 ? y - w.y : x - w.x
  return along > 0 && along < len
}

/** 两头门柱的圆心，格 */
export function warpPosts(w: WarpSpot, len: number): [Point, Point] {
  return [{ x: w.x, y: w.y }, warpEnd(w, len)]
}

/** 门线的法向：负侧指向正侧的单位向量 */
export function warpNormal(w: WarpSpot): Point {
  return w.axis === 0 ? { x: 1, y: 0 } : { x: 0, y: 1 }
}
