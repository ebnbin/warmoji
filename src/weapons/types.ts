import type Phaser from 'phaser'
import type { ProjectileSpec } from '../core/weapons'

export interface EnemyTarget {
  x: number
  y: number
  radius: number
  ref: Phaser.GameObjects.Image
}

/** 武器的行为主体：位置 + 视觉偏移（自体攻击类武器用它驱动角色本体动作） */
export interface WeaponOwner {
  readonly x: number
  readonly y: number
  setVisualOffset(dx: number, dy: number): void
}

/** 战场为武器提供的查询与效果注入，由 ArenaScene 实现 */
export interface WeaponContext {
  scene: Phaser.Scene
  /** 当前帧的存活敌人快照（每帧重建一次，武器间共享） */
  enemyTargets(): readonly EnemyTarget[]
  damageEnemy(enemy: Phaser.GameObjects.Image, damage: number): void
  spawnProjectile(x: number, y: number, angle: number, spec: ProjectileSpec, damage: number): void
  damageMul(): number
  cooldownMul(): number
}

/** 武器运行时：每（角色×武器）一个实例，自管冷却/视觉/攻击行为 */
export interface WeaponRuntime {
  update(delta: number, owner: WeaponOwner): void
  setVisible(on: boolean): void
  destroy(): void
}

/** 瞄准离 owner 最近的敌人，无敌人返回 null */
export function nearestAngle(owner: WeaponOwner, targets: readonly EnemyTarget[]): number | null {
  let best = Infinity
  let angle: number | null = null
  for (const t of targets) {
    const dx = t.x - owner.x
    const dy = t.y - owner.y
    const d = dx * dx + dy * dy
    if (d < best) {
      best = d
      angle = Math.atan2(dy, dx)
    }
  }
  return angle
}
