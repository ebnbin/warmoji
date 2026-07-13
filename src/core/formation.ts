import type { Point } from './vec'

/** 槽位 slot 在环形阵型中相对中心的偏移；0 号位于正上方，顺时针均分 */
export function slotOffset(slot: number, count: number, radius: number): Point {
  const angle = -Math.PI / 2 + (slot * 2 * Math.PI) / count
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}
