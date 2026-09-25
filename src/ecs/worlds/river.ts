import { isHorizontal } from '../utils/remap'
import type { Point } from '../../util/vec'

export interface RiverRect {
  x: number
  y: number
  w: number
  h: number
  horizontal: boolean
}

export function riverRect(viewW: number, viewH: number, riverWidth: number): RiverRect {
  const horizontal = isHorizontal(viewW, viewH)
  if (horizontal) {
    return { x: 0, y: (viewH - riverWidth) / 2, w: viewW, h: riverWidth, horizontal }
  }
  return { x: (viewW - riverWidth) / 2, y: 0, w: riverWidth, h: viewH, horizontal }
}

export function flowVector(horizontal: boolean, speed: number): Point {
  return horizontal ? { x: -speed, y: 0 } : { x: 0, y: speed }
}

export function pastDownstream(p: Point, viewW: number, viewH: number, pad: number): boolean {
  return isHorizontal(viewW, viewH) ? p.x < -pad : p.y > viewH + pad
}

export function clampToRiver(p: Point, rect: RiverRect, pad: number): Point {
  return {
    x: Math.min(Math.max(p.x, rect.x + pad), rect.x + rect.w - pad),
    y: Math.min(Math.max(p.y, rect.y + pad), rect.y + rect.h - pad),
  }
}

function driftProfile(crossFrac: number): number {
  const f = Math.min(1, Math.abs(crossFrac))
  return 0.6 + 0.4 * (1 - f * f)
}

export function driftSpeed(crossFrac: number, cfg: { driftSpeedMul: readonly [number, number] }, rand: () => number): number {
  return driftProfile(crossFrac) * (cfg.driftSpeedMul[0] + rand() * (cfg.driftSpeedMul[1] - cfg.driftSpeedMul[0]))
}
