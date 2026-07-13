import type { Rng } from './rng'
import type { Point } from './vec'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 在矩形四边外 outset 距离的一圈上取随机点（用于在相机可见区外刷怪） */
export function edgeSpawnPoint(rng: Rng, view: Rect, outset: number): Point {
  const left = Math.round(view.x - outset)
  const right = Math.round(view.x + view.width + outset)
  const top = Math.round(view.y - outset)
  const bottom = Math.round(view.y + view.height + outset)
  switch (rng.int(0, 3)) {
    case 0:
      return { x: rng.int(left, right), y: top }
    case 1:
      return { x: rng.int(left, right), y: bottom }
    case 2:
      return { x: left, y: rng.int(top, bottom) }
    default:
      return { x: right, y: rng.int(top, bottom) }
  }
}
