import { UNIT } from '../../util/units'
import { ACQUIRE } from '../../data/abilities'
import type { AbilityOwner, TargetInfo } from './types'

// 距离按像素平方比较；索敌必须有界

/** exclude 跳过真身；无目标返回 null */
export function nearestTarget(
  ox: number,
  oy: number,
  targets: readonly TargetInfo[],
  maxRange: number,
  exclude?: ReadonlySet<unknown>,
): TargetInfo | null {
  let best: TargetInfo | null = null
  let bestD = maxRange * maxRange
  for (const t of targets) {
    if (exclude?.has(t.ref)) continue
    const dx = t.x - ox
    const dy = t.y - oy
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      best = t
    }
  }
  return best
}

/** 无目标返回 null；上限缺省 ACQUIRE.range */
export function nearestAngle(
  owner: AbilityOwner,
  targets: readonly TargetInfo[],
  maxRange = ACQUIRE.range * UNIT,
): number | null {
  const t = nearestTarget(owner.x, owner.y, targets, maxRange)
  return t ? Math.atan2(t.y - owner.y, t.x - owner.x) : null
}

/** 缺省不设上限 */
export function angleToNearest(
  cx: number,
  cy: number,
  targets: readonly TargetInfo[],
  maxRange = Infinity,
): number | null {
  const t = nearestTarget(cx, cy, targets, maxRange)
  return t ? Math.atan2(t.y - cy, t.x - cx) : null
}

/** 无目标返回 null */
export function strongestTarget(
  ox: number,
  oy: number,
  targets: readonly TargetInfo[],
  maxRange: number,
  hpOf: (ref: TargetInfo['ref']) => number,
): TargetInfo | null {
  const r2 = maxRange * maxRange
  let best: TargetInfo | null = null
  let bestHp = -1
  for (const t of targets) {
    const dx = t.x - ox
    const dy = t.y - oy
    if (dx * dx + dy * dy > r2) continue
    const hp = hpOf(t.ref)
    if (hp > bestHp) {
      bestHp = hp
      best = t
    }
  }
  return best
}

export function targetsWithin(
  ox: number,
  oy: number,
  targets: readonly TargetInfo[],
  maxRange: number,
): TargetInfo[] {
  const r2 = maxRange * maxRange
  return targets.filter((t) => {
    const dx = t.x - ox
    const dy = t.y - oy
    return dx * dx + dy * dy <= r2
  })
}
