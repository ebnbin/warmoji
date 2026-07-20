import { UNIT } from '../core/units'
import { ACQUIRE } from './registry'
import type { AbilityOwner, TargetInfo } from './types'

// 索敌层（阵营中立）：从本帧敌对方快照里挑选攻击对象的可复用挑选器，与
// 「投送方式」正交——任何能力（突刺/弹道/连锁/轰炸/召唤…）都从这几个原语里
// 取目标，消除各能力类各写一遍的挑选循环。距离一律按像素平方比较；maxRange
// 传像素上限（Infinity 即不设限）。索敌必须有界——无限地图上不能瞄到无穷远。

/** 上限内离 (ox,oy) 最近的目标；exclude 跳过已命中的真身；无目标返回 null。 */
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

/** 瞄准最近目标的角度；无目标或全部超出上限返回 null。上限缺省 ACQUIRE.range。
 * 定向投送（突刺/弹道/横扫/回旋/装置/激光）用它对准。 */
export function nearestAngle(
  owner: AbilityOwner,
  targets: readonly TargetInfo[],
  maxRange = ACQUIRE.range * UNIT,
): number | null {
  const t = nearestTarget(owner.x, owner.y, targets, maxRange)
  return t ? Math.atan2(t.y - owner.y, t.x - owner.x) : null
}

/** 从任意锚点瞄准最近目标的角度（缺省不设上限——死亡冷枪是任意距离的临终一击）。 */
export function angleToNearest(
  cx: number,
  cy: number,
  targets: readonly TargetInfo[],
  maxRange = Infinity,
): number | null {
  const t = nearestTarget(cx, cy, targets, maxRange)
  return t ? Math.atan2(t.y - cy, t.x - cx) : null
}

/** 上限内血量最高的目标（瞬袭背刺血最厚者）；无目标返回 null。 */
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

/** 上限内的全部目标（连锁轰炸从中随机追加一发）。 */
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
