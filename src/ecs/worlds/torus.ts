import type { Point } from '../../util/vec'

// 坐标按模回绕，没有墙；距离/方向一律用环面最短差

/** 坐标回绕到 [0, size)（负数安全） */
function wrapCoord(v: number, size: number): number {
  return ((v % size) + size) % size
}

export function wrapPoint(p: Point, w: number, h: number): Point {
  return { x: wrapCoord(p.x, w), y: wrapCoord(p.y, h) }
}

/** 各轴回绕到 ±半场内 */
export function torusDelta(from: Point, to: Point, w: number, h: number): Point {
  let dx = to.x - from.x
  let dy = to.y - from.y
  dx -= Math.round(dx / w) * w
  dy -= Math.round(dy / h) * h
  return { x: dx, y: dy }
}

export function torusDist2(a: Point, b: Point, w: number, h: number): number {
  const d = torusDelta(a, b, w, h)
  return d.x * d.x + d.y * d.y
}

/** 任意观察者眼中的最近镜像必在 {真身, 这三个} 之中 */
export function ghostImages(p: Point, w: number, h: number): Point[] {
  const dx = p.x < w / 2 ? w : -w
  const dy = p.y < h / 2 ? h : -h
  return [
    { x: p.x + dx, y: p.y },
    { x: p.x, y: p.y + dy },
    { x: p.x + dx, y: p.y + dy },
  ]
}

/** 容器内最大居中定比矩形 */
export function fitAspectRect(
  containerW: number,
  containerH: number,
  aspectW: number,
  aspectH: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(containerW / aspectW, containerH / aspectH)
  const w = aspectW * scale
  const h = aspectH * scale
  return { x: (containerW - w) / 2, y: (containerH - h) / 2, w, h }
}
