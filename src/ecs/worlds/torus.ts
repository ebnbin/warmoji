import type { Point } from '../../util/vec'

function wrapCoord(v: number, size: number): number {
  return ((v % size) + size) % size
}

export function wrapPoint(p: Point, w: number, h: number): Point {
  return { x: wrapCoord(p.x, w), y: wrapCoord(p.y, h) }
}

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

export function ghostImages(p: Point, w: number, h: number): Point[] {
  const dx = p.x < w / 2 ? w : -w
  const dy = p.y < h / 2 ? h : -h
  return [
    { x: p.x + dx, y: p.y },
    { x: p.x, y: p.y + dy },
    { x: p.x + dx, y: p.y + dy },
  ]
}

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
