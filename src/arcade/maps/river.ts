import { isHorizontal } from './remap'
import type { Point } from '../../util/vec'

// 世界 = 逻辑视口；横屏水流从右往左，竖屏从上往下

export interface RiverRect {
  x: number
  y: number
  w: number
  h: number
  /** 水流是否沿水平轴（横屏 true / 竖屏 false） */
  horizontal: boolean
}

export function riverRect(viewW: number, viewH: number, riverWidth: number): RiverRect {
  const horizontal = isHorizontal(viewW, viewH)
  if (horizontal) {
    return { x: 0, y: (viewH - riverWidth) / 2, w: viewW, h: riverWidth, horizontal }
  }
  return { x: (viewW - riverWidth) / 2, y: 0, w: riverWidth, h: viewH, horizontal }
}

/** 水流速度矢量：横屏右→左（-x），竖屏上→下（+y） */
export function flowVector(horizontal: boolean, speed: number): Point {
  return horizontal ? { x: -speed, y: 0 } : { x: 0, y: speed }
}

/** 漂出下游 pad 距离 */
export function pastDownstream(p: Point, viewW: number, viewH: number, pad: number): boolean {
  return isHorizontal(viewW, viewH) ? p.x < -pad : p.y > viewH + pad
}

/** 玩家/Boss 专用 */
export function clampToRiver(p: Point, rect: RiverRect, pad: number): Point {
  return {
    x: Math.min(Math.max(p.x, rect.x + pad), rect.x + rect.w - pad),
    y: Math.min(Math.max(p.y, rect.y + pad), rect.y + rect.h - pad),
  }
}

/** crossFrac = |跨向偏移| / (河宽/2)，超出河道按岸边速度 */
export function driftProfile(crossFrac: number): number {
  const f = Math.min(1, Math.abs(crossFrac))
  return 0.6 + 0.4 * (1 - f * f)
}
