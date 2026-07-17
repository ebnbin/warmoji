import type { Point } from './vec'

// 河流地图的世界模型（纯逻辑，禁 phaser/DOM）。
// 世界 = 逻辑视口（相机静止）；河道沿长轴、跨短轴居中、宽度恒定。
// 横屏：水流从右往左（右上游、左下游）；竖屏：从上往下（上上游、下下游）。
// 横竖屏是同一条河：本项目视口按「长短边保底」适配，同一设备旋转后
// 长边=长边、短边=短边，重映射是严格的逆时针 90° 旋转，零拉伸。

export interface RiverRect {
  x: number
  y: number
  w: number
  h: number
  /** 水流是否沿水平轴（横屏 true / 竖屏 false） */
  horizontal: boolean
}

/** 视口是否横屏（宽 ≥ 高 → 河水平流动） */
export function isHorizontal(viewW: number, viewH: number): boolean {
  return viewW >= viewH
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

/** 沿流向的进度（0 = 上游边缘，1 = 下游边缘） */
export function flowProgress(p: Point, viewW: number, viewH: number): number {
  return isHorizontal(viewW, viewH) ? (viewW - p.x) / viewW : p.y / viewH
}

/** 跨流向的带符号偏移（0 = 河道中线；符号跟随屏幕轴向） */
export function crossOffset(p: Point, viewW: number, viewH: number): number {
  return isHorizontal(viewW, viewH) ? p.y - viewH / 2 : p.x - viewW / 2
}

/** 视口变化时的坐标重映射：保持「流向进度 + 跨向偏移」不变。
 * 横↔竖时等价于整体逆时针 90° 旋转（上游对上游、左右岸不镜像）；
 * 同向仅尺寸变化（桌面拉窗口）时，沿流向按比例、跨向保持绝对偏移 */
export function remapPoint(
  p: Point,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
): Point {
  const u = flowProgress(p, fromW, fromH)
  const v = crossOffset(p, fromW, fromH)
  if (isHorizontal(toW, toH)) {
    return { x: toW * (1 - u), y: toH / 2 + v }
  }
  return { x: toW / 2 + v, y: toH * u }
}

/** 视口变化时的速度/朝向矢量重映射：横→竖逆时针系 (vx,vy)→(vy,−vx)，
 * 竖→横为其逆 (vx,vy)→(−vy,vx)；同向不变 */
export function remapVector(
  v: Point,
  fromHorizontal: boolean,
  toHorizontal: boolean,
): Point {
  if (fromHorizontal === toHorizontal) return { x: v.x, y: v.y }
  if (fromHorizontal) return { x: v.y, y: -v.x }
  return { x: -v.y, y: v.x }
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
