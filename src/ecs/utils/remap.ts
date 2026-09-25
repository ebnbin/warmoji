import type { Point } from '../../util/vec'

export function isHorizontal(viewW: number, viewH: number): boolean {
  return viewW >= viewH
}

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

export function remapVector(
  v: Point,
  fromHorizontal: boolean,
  toHorizontal: boolean,
): Point {
  if (fromHorizontal === toHorizontal) return { x: v.x, y: v.y }
  if (fromHorizontal) return { x: v.y, y: -v.x }
  return { x: -v.y, y: v.x }
}
