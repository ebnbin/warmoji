import type { Point } from '../core/vec'

// 视口横竖切换的通用矩形重映射（河流图 / 虚空图共用）。
// 本项目视口按「长短边保底」适配：同一设备旋转后长边=长边、短边=短边，
// 朝向翻转即严格的逆时针 90° 旋转（不镜像），零拉伸；
// 同向仅尺寸变化（桌面拉窗口）时，长轴按比例、跨轴保持中心绝对偏移。

/** 视口是否横屏（宽 ≥ 高） */
export function isHorizontal(viewW: number, viewH: number): boolean {
  return viewW >= viewH
}

/** 坐标重映射。锚定：长轴进度以横屏右缘 = 竖屏顶缘为 0（逆时针旋转的约定），
 * 跨轴取相对短轴中线的带符号偏移 */
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

/** 速度/朝向矢量重映射：横→竖逆时针系 (vx,vy)→(vy,−vx)，
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
