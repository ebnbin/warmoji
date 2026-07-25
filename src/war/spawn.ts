import type { Rng } from '../util/rng'
import { dist2 } from '../util/vec'
import type { Point } from '../util/vec'

/**
 * 地图内随机刷怪点：距边缘 ≥ inset，距 avoid（玩家）≥ minDist；
 * 拒绝采样最多 20 次，全拒则返回最后一次（minDist 过大时的兜底）。
 */
export function randomMapPoint(
  rng: Rng,
  width: number,
  height: number,
  inset: number,
  avoid: Point,
  minDist: number,
): Point {
  const xMin = Math.round(inset)
  const xMax = Math.round(width - inset)
  const yMin = Math.round(inset)
  const yMax = Math.round(height - inset)
  let p: Point = { x: xMin, y: yMin }
  for (let i = 0; i < 20; i++) {
    p = { x: rng.int(xMin, xMax), y: rng.int(yMin, yMax) }
    if (dist2(p, avoid) >= minDist * minDist) return p
  }
  return p
}
