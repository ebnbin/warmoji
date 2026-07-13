import { dist2 } from './vec'
import type { Point } from './vec'

/** 最近点的下标；空数组返回 -1 */
export function nearestIndex(from: Point, points: readonly Point[]): number {
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < points.length; i++) {
    const d = dist2(from, points[i]!)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}
