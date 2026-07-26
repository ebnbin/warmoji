import { UNIT } from '../util/units'
import { TEAM } from './characters'
import type { Point } from '../util/vec'
import type { FormationId } from '../types/formation'

/** 环形阵按人数取半径：3 人小环更紧凑 */
function ringRadius(count: number): number {
  return (count === 3 ? TEAM.smallRingRadius : TEAM.ringRadius) * UNIT
}

/** 岗位在「可旋转环」上的基准角（不含相位）：环形 ≥3 人全员上环；
 * N 保 1 的 0 号居中（null）、其余上外圈。null 岗位不参与环上主力竞争
 *（1~2 人阵整体不旋转，全员 null） */
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

/** 队形各岗位相对队伍中心的偏移；ringPhase 为环相位（环形 ≥3 人全员、
 * N 保 1 外圈随之整体旋转，中心与 1~2 人阵不受影响）。
 * 岗位序：环形 0 号正上顺时针（2 人为左、右）；N 保 1 0 号中心、1.. 外圈 */
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
