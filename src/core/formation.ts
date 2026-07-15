import { FORMATION, TEAM } from './config'
import type { Point } from './vec'

// 队形系统：满员队伍可在整编页切换队形、互换岗位（未满员固定环形阵）。
// 承伤差异纯几何概率——站位决定谁先被敌人摸到，没有额外的减伤/仇恨机制。
// 环形阵与多保一外圈支持整体旋转（ringPhase 由 Arena 的主力竞争驱动，多保一中心固定）；
// 前后阵前排呈半弧、后排横排相对固定，整阵随移动方向平滑转向。
export type FormationId = 'ring' | 'guard' | 'vanguard'

export const FORMATION_IDS: readonly FormationId[] = ['ring', 'guard', 'vanguard']

/** 槽位 slot 在环形阵型中相对中心的偏移；0 号位于正上方，顺时针均分 */
export function slotOffset(slot: number, count: number, radius: number): Point {
  const angle = -Math.PI / 2 + (slot * 2 * Math.PI) / count
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

/** 前后阵 = 定向版四保一：殿后恒 1 人，其余全员上前弧（5 人 → 前四后一） */
export function vanguardSplit(count: number): { front: number; back: number } {
  const front = Math.max(1, count - 1)
  return { front, back: count - front }
}

const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const

/** 展示名按人数自适应：前后阵 5 人显示「前三后二」、6 人「前三后三」 */
export function formationName(id: FormationId, count: number): string {
  if (id === 'ring') return '环形阵'
  if (id === 'guard') return '多保一'
  const { front, back } = vanguardSplit(count)
  return `前${CN_NUM[front] ?? front}后${CN_NUM[back] ?? back}`
}

export function formationDesc(id: FormationId): string {
  if (id === 'ring') return '全员均匀环绕，四面兼顾'
  if (id === 'guard') return '一人居中受掩护，更少被摸到'
  return '前弧随移动开路，掩护殿后'
}

/** 岗位在「可旋转环」上的基准角（不含相位）：环形全员上环；多保一 0 号居中（null）、
 * 其余上外圈；前后阵不旋转（null）。返回 null 的岗位不参与环上主力竞争 */
export function ringPostAngle(id: FormationId, post: number, count: number): number | null {
  if (id === 'ring') return -Math.PI / 2 + (post * 2 * Math.PI) / count
  if (id === 'guard' && count >= 2) {
    if (post === 0) return null
    return -Math.PI / 2 + ((post - 1) * 2 * Math.PI) / (count - 1)
  }
  return null
}

/** 队形各岗位相对队伍中心的偏移。
 * facingRad 为移动朝向（仅前后阵生效）；ringPhase 为环相位（环形全员、
 * 多保一外圈随之整体旋转，中心与前后阵不受影响）。
 * 岗位序：环形 0 号正上顺时针；多保一 0 号中心、1.. 外圈；
 * 前后阵先前排（弧上从一端到另一端）后后排（横排从左到右） */
export function formationPosts(
  id: FormationId,
  count: number,
  facingRad: number,
  ringPhase = 0,
): Point[] {
  if (id === 'guard' && count >= 2) {
    return Array.from({ length: count }, (_, post) => {
      const base = ringPostAngle('guard', post, count)
      if (base === null) return { x: 0, y: 0 }
      const a = base + ringPhase
      return { x: Math.cos(a) * TEAM.ringRadius, y: Math.sin(a) * TEAM.ringRadius }
    })
  }
  if (id === 'vanguard' && count >= 2) {
    const { front } = vanguardSplit(count)
    // 前弧：以中心为圆心，弧上均匀铺开，弧心正对朝向
    const arc = (i: number): Point => {
      const a = facingRad + (i - (front - 1) / 2) * FORMATION.frontArcStep
      return { x: Math.cos(a) * FORMATION.frontRadius, y: Math.sin(a) * FORMATION.frontRadius }
    }
    // 殿后一人：紧贴中心背侧
    const rear: Point = {
      x: -Math.cos(facingRad) * FORMATION.backDist,
      y: -Math.sin(facingRad) * FORMATION.backDist,
    }
    return [...Array.from({ length: front }, (_, i) => arc(i)), rear]
  }
  return Array.from({ length: count }, (_, post) => {
    const a = (ringPostAngle('ring', post, count) ?? 0) + ringPhase
    return { x: Math.cos(a) * TEAM.ringRadius, y: Math.sin(a) * TEAM.ringRadius }
  })
}
