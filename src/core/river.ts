import { isHorizontal } from './remap'
import type { Point } from './vec'

// 河流地图的世界模型（纯逻辑，禁 phaser/DOM）。
// 世界 = 逻辑视口（相机静止）；河道沿长轴、跨短轴居中、宽度恒定。
// 横屏：水流从右往左（右上游、左下游）；竖屏：从上往下（上上游、下下游）。
// 横竖屏是同一条河：朝向切换时的坐标/矢量重映射是通用几何，见 ./remap.ts。

export interface RiverRect {
  x: number
  y: number
  w: number
  h: number
  /** 水流是否沿水平轴（横屏 true / 竖屏 false） */
  horizontal: boolean
}

/** 河道矩形：长轴贯穿全屏，跨轴居中、宽 riverWidth；两侧余量即河岸 */
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

/** 是否已漂出下游边界外 pad 距离（金币清理判定） */
export function pastDownstream(p: Point, viewW: number, viewH: number, pad: number): boolean {
  return isHorizontal(viewW, viewH) ? p.x < -pad : p.y > viewH + pad
}

/** 钳入河道（玩家/Boss 专用；其余实体自由出界） */
export function clampToRiver(p: Point, rect: RiverRect, pad: number): Point {
  return {
    x: Math.min(Math.max(p.x, rect.x + pad), rect.x + rect.w - pad),
    y: Math.min(Math.max(p.y, rect.y + pad), rect.y + rect.h - pad),
  }
}

/** 漂浮物速度剖面：河心最快、近岸放缓（真实河流的流速分布，仅视觉层用）。
 * crossFrac = |跨向偏移| / (河宽/2)，超出河道按岸边速度 */
export function driftProfile(crossFrac: number): number {
  const f = Math.min(1, Math.abs(crossFrac))
  return 0.6 + 0.4 * (1 - f * f)
}
