import type { Point } from './vec'

// 武器 = 独立于角色的攻击行为单元。角色持有 0..n 把武器（甚至自身即武器）。
// 新增武器类型：在此加 kind 与 Spec，src/weapons/ 加对应运行时类并注册 factory。

export interface ThrustSpec {
  readonly kind: 'thrust'
  readonly emoji: string
  readonly size: number
  /** 持有物静止时距角色中心的距离 */
  readonly restOffset: number
  readonly damage: number
  readonly cooldownMs: number
  /** 突刺判定：从角色中心沿瞄准方向的线段长度 */
  readonly reach: number
  /** 判定半径（胶囊粗细，另加敌人自身半径） */
  readonly hitRadius: number
  readonly thrustMs: number
  /** emoji 素材的原始朝向补偿 */
  readonly rotationOffsetRad: number
}

export interface ProjectileSpec {
  readonly kind: 'projectile'
  readonly emoji: string
  readonly size: number
  readonly restOffset: number
  readonly damage: number
  readonly cooldownMs: number
  readonly rotationOffsetRad: number
  /** 朝左射击时垂直翻转持有物（枪类不至于倒握） */
  readonly flipWhenLeft: boolean
  readonly projectile: {
    readonly emoji: string
    readonly size: number
    readonly radius: number
    readonly speed: number
    readonly rotationOffsetRad: number
  }
}

export type WeaponSpec = ThrustSpec | ProjectileSpec

export interface ThrustTarget {
  x: number
  y: number
  radius: number
}

/** 突刺命中：目标圆与线段 [origin, origin + dir·reach] 的距离 ≤ hitRadius + 目标半径 */
export function thrustHitIndices(
  origin: Point,
  angle: number,
  reach: number,
  hitRadius: number,
  targets: readonly ThrustTarget[],
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
