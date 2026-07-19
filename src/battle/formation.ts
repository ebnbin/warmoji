import { UNIT } from '../lib/units'
import { TEAM } from '../characters/registry'
import type { Point } from '../lib/vec'

// 队形系统（已简化为唯一策略）：满员前按人数取形，满员后自动列成「N 保 1」——
// N−1 人外圈、1 人居中受保护，玩家唯一的决策是保谁（首次满员自动展示一次
// 阵型页，之后走商店入口调整）。
// 环形阵按人数分形：1 人居中、2 人紧凑左右并肩（都不环绕），3 人小半径环，
// ≥4 人标准半径环（理论上限 8 人，允许一定重叠）。环形 ≥3 人全员、N 保 1
// 外圈支持整体旋转（ringPhase 由 Arena 的主力竞争驱动），中心与 1~2 人阵
// 只保留待机游移。承伤差异纯几何：谁先被敌人摸到谁掉血，无数值加成。
export type FormationId = 'ring' | 'guard'

/** 槽位 slot 在环形阵型中相对中心的偏移；0 号位于正上方，顺时针均分 */
export function slotOffset(slot: number, count: number, radius: number): Point {
  const angle = -Math.PI / 2 + (slot * 2 * Math.PI) / count
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

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
