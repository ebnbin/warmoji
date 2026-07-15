import { FORMATION, TEAM } from './config'
import type { Point } from './vec'

// 队形系统：满员队伍可在整编页切换队形、互换岗位（未满员固定环形阵）。
// 承伤差异纯几何概率——站位决定谁先被敌人摸到，没有额外的减伤/仇恨机制。
export type FormationId = 'ring' | 'guard' | 'vanguard'

export const FORMATION_IDS: readonly FormationId[] = ['ring', 'guard', 'vanguard']

/** 槽位 slot 在环形阵型中相对中心的偏移；0 号位于正上方，顺时针均分 */
export function slotOffset(slot: number, count: number, radius: number): Point {
  const angle = -Math.PI / 2 + (slot * 2 * Math.PI) / count
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

/** 前后阵的前排人数 = 半数向上取整（5 人 → 前三后二） */
export function vanguardSplit(count: number): { front: number; back: number } {
  const front = Math.ceil(count / 2)
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
  return '随移动方向旋转，前排先接敌'
}

/** 队形各岗位相对队伍中心的偏移；facingRad 为移动朝向（仅前后阵生效）。
 * 岗位序：环形 0 号正上顺时针；多保一 0 号中心、1.. 外圈；
 * 前后阵先前排后后排，各排沿朝向从左到右 */
export function formationPosts(id: FormationId, count: number, facingRad: number): Point[] {
  if (id === 'guard' && count >= 2) {
    return [
      { x: 0, y: 0 },
      ...Array.from({ length: count - 1 }, (_, i) => slotOffset(i, count - 1, TEAM.ringRadius)),
    ]
  }
  if (id === 'vanguard' && count >= 2) {
    const { front, back } = vanguardSplit(count)
    const fx = Math.cos(facingRad)
    const fy = Math.sin(facingRad)
    // 屏幕坐标 y 向下，(−fy, fx) 是朝向的左手边 → 排内从左到右
    const rx = -fy
    const ry = fx
    const post = (n: number, i: number, dist: number): Point => {
      const lat = (i - (n - 1) / 2) * FORMATION.spacing
      return { x: fx * dist + rx * lat, y: fy * dist + ry * lat }
    }
    return [
      ...Array.from({ length: front }, (_, i) => post(front, i, FORMATION.frontDist)),
      ...Array.from({ length: back }, (_, i) => post(back, i, -FORMATION.backDist)),
    ]
  }
  return Array.from({ length: count }, (_, i) => slotOffset(i, count, TEAM.ringRadius))
}
