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
