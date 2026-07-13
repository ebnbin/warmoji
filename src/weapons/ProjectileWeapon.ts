import Phaser from 'phaser'
import type { Point } from '../core/vec'
import type { ProjectileSpec } from '../core/weapons'
import { emojiImage } from '../ui/emoji'
import type { WeaponContext, WeaponRuntime } from './types'

/** 发射型：持有物固定在角色身侧、指向目标，周期发射单体伤害的子弹 */
export class ProjectileWeapon implements WeaponRuntime {
  private image: Phaser.GameObjects.Image
  private cooldown: number
  private aim = 0

  constructor(
    private spec: ProjectileSpec,
    private ctx: WeaponContext,
    initialCooldownMs: number,
  ) {
    this.image = emojiImage(ctx.scene, 0, 0, spec.emoji, spec.size, true).setDepth(13)
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: Point): void {
    this.cooldown -= delta
    this.image.setPosition(
      owner.x + Math.cos(this.aim) * this.spec.restOffset,
      owner.y + Math.sin(this.aim) * this.spec.restOffset,
    )
    this.image.setRotation(this.aim + this.spec.rotationOffsetRad)
    if (this.spec.flipWhenLeft) {
      this.image.setFlipY(Math.abs(Phaser.Math.Angle.Wrap(this.aim)) > Math.PI / 2)
    }

    if (this.cooldown > 0) return
    const targets = this.ctx.enemyTargets()
    if (targets.length === 0) return
    this.cooldown = this.spec.cooldownMs * this.ctx.cooldownMul()

    let bestD = Infinity
    for (const t of targets) {
      const dx = t.x - owner.x
      const dy = t.y - owner.y
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        this.aim = Math.atan2(dy, dx)
      }
    }

    const damage = Math.round(this.spec.damage * this.ctx.damageMul())
    this.ctx.spawnProjectile(
      owner.x + Math.cos(this.aim) * this.spec.restOffset,
      owner.y + Math.sin(this.aim) * this.spec.restOffset,
      this.aim,
      this.spec,
      damage,
    )
  }

  setVisible(on: boolean): void {
    this.image.setVisible(on)
  }

  destroy(): void {
    this.image.destroy()
  }
}
