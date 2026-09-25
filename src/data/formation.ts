import { UNIT } from '../util/units'
import { TEAM } from './characters'
import type { Point } from '../util/vec'

/** 招募页头像的环形排版 */
export function ringPosts(count: number, phase = 0): Point[] {
  if (count <= 1) return Array.from({ length: count }, () => ({ x: 0, y: 0 }))
  if (count === 2) {
    return [
      { x: (-TEAM.pairGap / 2) * UNIT, y: 0 },
      { x: (TEAM.pairGap / 2) * UNIT, y: 0 },
    ]
  }
  const r = (count === 3 ? TEAM.smallRingRadius : TEAM.ringRadius) * UNIT
  return Array.from({ length: count }, (_, post) => {
    const a = -Math.PI / 2 + (post * 2 * Math.PI) / count + phase
    return { x: Math.cos(a) * r, y: Math.sin(a) * r }
  })
}

/** 队长身后 distance 格、张开 spreadDeg 的扇形上的 n 个目标位偏移，从一侧排到另一侧 */
export function fanSlots(n: number, distance: number, spreadDeg: number, hx: number, hy: number): Point[] {
  const back = Math.atan2(-hy, -hx)
  const spread = (spreadDeg * Math.PI) / 180
  return Array.from({ length: n }, (_, i) => {
    const a = back + (n > 1 ? -spread / 2 + (spread * i) / (n - 1) : 0)
    return { x: Math.cos(a) * distance * UNIT, y: Math.sin(a) * distance * UNIT }
  })
}
