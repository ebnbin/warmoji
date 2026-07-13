import type Phaser from 'phaser'
import type { ProjectileSpec } from '../core/weapons'
import type { Point } from '../core/vec'

export interface EnemyTarget {
  x: number
  y: number
  radius: number
  ref: Phaser.GameObjects.Image
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
  update(delta: number, owner: Point): void
  setVisible(on: boolean): void
  destroy(): void
}
