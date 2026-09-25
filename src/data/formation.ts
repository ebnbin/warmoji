import { UNIT } from '../util/units'
import { TEAM } from './characters'
import type { Point } from '../util/vec'
import type { FormationId } from '../types/formation'

function ringRadius(count: number): number {
  return (count === 3 ? TEAM.smallRingRadius : TEAM.ringRadius) * UNIT
}

export function ringPostAngle(id: FormationId, post: number, count: number): number | null {
  if (id === 'ring') {
    if (count < 3) return null
    return -Math.PI / 2 + (post * 2 * Math.PI) / count
  }
  if (count >= 2) {
    if (post === 0) return null
    return -Math.PI / 2 + ((post - 1) * 2 * Math.PI) / (count - 1)
  }
  return null
}

export function formationPosts(id: FormationId, count: number, ringPhase = 0): Point[] {
  if (id === 'guard' && count >= 2) {
    return Array.from({ length: count }, (_, post) => {
      const base = ringPostAngle('guard', post, count)
      if (base === null) return { x: 0, y: 0 }
      const a = base + ringPhase
      return { x: Math.cos(a) * TEAM.ringRadius * UNIT, y: Math.sin(a) * TEAM.ringRadius * UNIT }
    })
  }
  if (count <= 1) return Array.from({ length: count }, () => ({ x: 0, y: 0 }))
  if (count === 2) {
    return [
      { x: (-TEAM.pairGap / 2) * UNIT, y: 0 },
      { x: (TEAM.pairGap / 2) * UNIT, y: 0 },
    ]
  }
  const r = ringRadius(count)
  return Array.from({ length: count }, (_, post) => {
    const a = (ringPostAngle('ring', post, count) ?? 0) + ringPhase
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
