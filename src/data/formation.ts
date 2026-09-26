import { UNIT } from '../util/units'
import type { Point } from '../util/vec'

/** 队长身后 distance 格、张开 spreadDeg 的扇形上的 n 个目标位偏移，从一侧排到另一侧 */
export function fanSlots(n: number, distance: number, spreadDeg: number, hx: number, hy: number): Point[] {
  const back = Math.atan2(-hy, -hx)
  const spread = (spreadDeg * Math.PI) / 180
  return Array.from({ length: n }, (_, i) => {
    const a = back + (n > 1 ? -spread / 2 + (spread * i) / (n - 1) : 0)
    return { x: Math.cos(a) * distance * UNIT, y: Math.sin(a) * distance * UNIT }
  })
}
