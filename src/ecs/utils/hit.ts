import type { Point } from '../../util/vec'

export interface HitTarget {
  x: number
  y: number
  radius: number
}

function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI)
  if (r <= -Math.PI) r += 2 * Math.PI
  if (r > Math.PI) r -= 2 * Math.PI
  return r
}

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
