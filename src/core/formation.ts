import { TEAM } from './config'
import type { Point } from './vec'

// 队形系统（已简化为唯一策略）：满员前固定环形阵，满员后自动列成「N 保 1」——
// N−1 人外圈、1 人居中受保护，玩家唯一的决策是保谁（run.guardCenterId，
// 首次满员自动展示一次阵型页，之后走商店入口调整）。
// 环形阵全员、N 保 1 外圈支持整体旋转（ringPhase 由 Arena 的主力竞争驱动），
// 中心固定只保留待机游移。承伤差异纯几何：谁先被敌人摸到谁掉血，无数值加成。
export type FormationId = 'ring' | 'guard'

/** 槽位 slot 在环形阵型中相对中心的偏移；0 号位于正上方，顺时针均分 */
export function slotOffset(slot: number, count: number, radius: number): Point {
  const angle = -Math.PI / 2 + (slot * 2 * Math.PI) / count
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

/** 岗位在「可旋转环」上的基准角（不含相位）：环形全员上环；
 * N 保 1 的 0 号居中（null）、其余上外圈。null 岗位不参与环上主力竞争 */
export function ringPostAngle(id: FormationId, post: number, count: number): number | null {
  if (id === 'ring') return -Math.PI / 2 + (post * 2 * Math.PI) / count
  if (count >= 2) {
    if (post === 0) return null
    return -Math.PI / 2 + ((post - 1) * 2 * Math.PI) / (count - 1)
  }
  return null
}

/** 队形各岗位相对队伍中心的偏移；ringPhase 为环相位（环形全员、
 * N 保 1 外圈随之整体旋转，中心不受影响）。
 * 岗位序：环形 0 号正上顺时针；N 保 1 0 号中心、1.. 外圈 */
export function formationPosts(id: FormationId, count: number, ringPhase = 0): Point[] {
  if (id === 'guard' && count >= 2) {
    return Array.from({ length: count }, (_, post) => {
      const base = ringPostAngle('guard', post, count)
      if (base === null) return { x: 0, y: 0 }
      const a = base + ringPhase
      return { x: Math.cos(a) * TEAM.ringRadius, y: Math.sin(a) * TEAM.ringRadius }
    })
  }
  return Array.from({ length: count }, (_, post) => {
    const a = (ringPostAngle('ring', post, count) ?? 0) + ringPhase
    return { x: Math.cos(a) * TEAM.ringRadius, y: Math.sin(a) * TEAM.ringRadius }
  })
}
