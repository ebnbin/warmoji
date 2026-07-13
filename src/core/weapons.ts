import type { Point } from './vec'

// 武器 = 独立于角色的攻击行为单元；held 缺省时行为主体是角色本体。
// 新增武器类型：在此加 kind 与 Spec，src/weapons/ 加对应运行时类并注册 create.ts。

/** 持有物视觉：挂在角色身上的武器 emoji */
export interface HeldVisual {
  readonly emoji: string
  readonly size: number
  /** 静止时距角色中心的距离 */
  readonly restOffset: number
  /** emoji 素材的原始朝向补偿 */
  readonly rotationOffsetRad: number
  /** 左/右手横向挂载（垂直于瞄准方向偏移 mountGap） */
  readonly mountSide?: -1 | 1
  readonly mountGap?: number
}

export interface ThrustSpec {
  readonly kind: 'thrust'
  readonly name: string
  /** 属性面板等 UI 的展示图标 */
  readonly icon: string
  readonly damage: number
  readonly cooldownMs: number
  /** 判定：从角色中心沿瞄准方向的线段长度 */
  readonly reach: number
  readonly hitRadius: number
  readonly thrustMs: number
  /** 无持有物时角色本体前冲的距离 */
  readonly lungeDist: number
  readonly held?: HeldVisual
}

export interface ProjectileSpec {
  readonly kind: 'projectile'
  readonly name: string
  readonly icon: string
  readonly damage: number
  readonly cooldownMs: number
  readonly held?: HeldVisual
  readonly projectile: {
    readonly emoji: string
    readonly size: number
    readonly radius: number
    readonly speed: number
    readonly rotationOffsetRad: number
  }
}

export interface SweepSpec {
  readonly kind: 'sweep'
  readonly name: string
  readonly icon: string
  readonly damage: number
  readonly cooldownMs: number
  /** 扇形判定半径与弧宽 */
  readonly radius: number
  readonly arcRad: number
  readonly sweepMs: number
  readonly held: HeldVisual
}

export interface AreaBlastSpec {
  readonly kind: 'areaBlast'
  readonly name: string
  readonly icon: string
  readonly damage: number
  readonly cooldownMs: number
  /** 侦测范围：在此距离内选取爆心（离持有者最近的敌人） */
  readonly detectRange: number
  /** 爆炸判定半径（以爆心为圆心） */
  readonly blastRadius: number
  /** 特效环颜色 */
  readonly color: number
}

export interface BoomerangSpec {
  readonly kind: 'boomerang'
  readonly name: string
  readonly icon: string
  readonly damage: number
  /** 接住后才开始计冷却 */
  readonly cooldownMs: number
  /** 去程距离在出手瞬间锁定 */
  readonly range: number
  readonly outMs: number
  /** 回程追踪角色实时位置的速度 */
  readonly returnSpeed: number
  readonly hitRadius: number
  readonly spinRadPerSec: number
  readonly held: HeldVisual
}

export type WeaponSpec = ThrustSpec | ProjectileSpec | SweepSpec | AreaBlastSpec | BoomerangSpec

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

/** 线段扫掠命中：沿 a→b 最先进入命中范围的目标下标，无命中返回 -1。
 * 子弹按帧步进，低帧率下单帧位移可远超目标直径（穿模），必须用扫掠而非点重叠判定 */
export function sweepFirstHitIndex(
  a: Point,
  b: Point,
  radius: number,
  targets: readonly HitTarget[],
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let best = -1
  let bestT = Infinity
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!
    const px = t.x - a.x
    const py = t.y - a.y
    const proj = len2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0
    const cx = px - dx * proj
    const cy = py - dy * proj
    const rr = radius + t.radius
    if (cx * cx + cy * cy <= rr * rr && proj < bestT) {
      bestT = proj
      best = i
    }
  }
  return best
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
