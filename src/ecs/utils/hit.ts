import type { Point } from '../../util/vec'

// 命中几何：能力运行时判「打没打到」的纯函数（突刺线段 / 扫掠线段 / 圆 / 扇形）。
// 与能力的数据形状（data/abilityDefs.ts）分开——那边是「这个能力长什么样」，
// 这边是「这一发打中了谁」，只有战斗侧用得到。

export interface HitTarget {
  x: number
  y: number
  radius: number
}

/** 归一化到 (-π, π] */
export function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI)
  if (r <= -Math.PI) r += 2 * Math.PI
  if (r > Math.PI) r -= 2 * Math.PI
  return r
}

/** 突刺命中：目标圆与线段 [origin, origin + dir·reach] 的距离 ≤ hitRadius + 目标半径 */
export function thrustHitIndices(
  origin: Point,
  angle: number,
  reach: number,
  hitRadius: number,
  targets: readonly HitTarget[],
): number[] {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const out: number[] = []
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!
    const px = t.x - origin.x
    const py = t.y - origin.y
    const proj = Math.max(0, Math.min(reach, px * dx + py * dy))
    const cx = px - dx * proj
    const cy = py - dy * proj
    const rr = hitRadius + t.radius
    if (cx * cx + cy * cy <= rr * rr) out.push(i)
  }
  return out
}

/** 圆形命中：与圆心距离 ≤ radius + 目标半径 */
export function circleHitIndices(
  center: Point,
  radius: number,
  targets: readonly HitTarget[],
): number[] {
  const out: number[] = []
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!
    const dx = t.x - center.x
    const dy = t.y - center.y
    const rr = radius + t.radius
    if (dx * dx + dy * dy <= rr * rr) out.push(i)
  }
  return out
}

/** 扇形命中：距离在半径内且方位角在弧宽内（贴身目标直接命中） */
export function sectorHitIndices(
  origin: Point,
  aimAngle: number,
  arcRad: number,
  radius: number,
  targets: readonly HitTarget[],
): number[] {
  const out: number[] = []
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!
    const dx = t.x - origin.x
    const dy = t.y - origin.y
    const rr = radius + t.radius
    const d2 = dx * dx + dy * dy
    if (d2 > rr * rr) continue
    if (d2 <= t.radius * t.radius) {
      out.push(i)
      continue
    }
    if (Math.abs(wrapAngle(Math.atan2(dy, dx) - aimAngle)) <= arcRad / 2) out.push(i)
  }
  return out
}
