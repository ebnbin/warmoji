import type { Point } from '../../util/vec'

// 朝向翻转即逆时针 90° 旋转，零拉伸；同向仅尺寸变化时长轴按比例、跨轴保持中心绝对偏移

export function isHorizontal(viewW: number, viewH: number): boolean {
  return viewW >= viewH
}

/** 长轴进度以横屏右缘 = 竖屏顶缘为 0；跨轴取相对短轴中线的带符号偏移 */
export function remapPoint(
  p: Point,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
): Point {
  const fromHorizontal = isHorizontal(fromW, fromH)
  const u = fromHorizontal ? (fromW - p.x) / fromW : p.y / fromH
  const v = fromHorizontal ? p.y - fromH / 2 : p.x - fromW / 2
  if (isHorizontal(toW, toH)) {
    return { x: toW * (1 - u), y: toH / 2 + v }
  }
  return { x: toW / 2 + v, y: toH * u }
}

/** 横→竖 (vx,vy)→(vy,−vx)，竖→横为其逆 */
export function remapVector(
  v: Point,
  fromHorizontal: boolean,
  toHorizontal: boolean,
): Point {
  if (fromHorizontal === toHorizontal) return { x: v.x, y: v.y }
  if (fromHorizontal) return { x: v.y, y: -v.x }
  return { x: -v.y, y: v.x }
}
