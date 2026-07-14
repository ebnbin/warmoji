import type Phaser from 'phaser'
import { thrustHitIndices } from '../core/weapons'
import type { LaserSpec } from '../core/weapons'
import { emojiImage } from '../ui/emoji'
import type { WeaponContext, WeaponOwner, WeaponRuntime } from './types'

/** 贯穿激光：向最近的敌人方向发射光束，线段胶囊判定命中直线上的所有敌人 */
export class LaserWeapon implements WeaponRuntime {
  private image: Phaser.GameObjects.Image
  private cooldown: number
  private aim = 0
  private hidden = false

  constructor(
    private spec: LaserSpec,
    private ctx: WeaponContext,
    initialCooldownMs: number,
  ) {
    this.image = emojiImage(ctx.scene, 0, 0, spec.held.emoji, spec.held.size, 'player').setDepth(13)
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: WeaponOwner): void {
    this.cooldown -= delta
    const held = this.spec.held
    this.image.setPosition(
      owner.x + Math.cos(this.aim) * held.restOffset,
      owner.y + Math.sin(this.aim) * held.restOffset,
    )
    this.image.setRotation(this.aim + held.rotationOffsetRad)

    if (this.cooldown > 0 || this.hidden) return
    const targets = this.ctx.enemyTargets()
    // 最近敌人在射程内才开火
    let best = Infinity
    let aim: number | null = null
    for (const t of targets) {
      const dx = t.x - owner.x
      const dy = t.y - owner.y
      const d = dx * dx + dy * dy
      if (d < best) {
        best = d
        aim = Math.atan2(dy, dx)
      }
    }
    if (aim === null || best > this.spec.range * this.spec.range) return
    this.aim = aim
    this.cooldown = this.spec.cooldownMs * this.ctx.cooldownMul()

    const damage = Math.round(this.spec.damage * this.ctx.damageMul())
    const origin = { x: owner.x, y: owner.y }
    for (const i of thrustHitIndices(origin, aim, this.spec.range, this.spec.beamRadius, targets)) {
      this.ctx.damageEnemy(targets[i]!.ref, damage, this.spec.knockback, origin.x, origin.y)
    }
    this.beamEffect(origin.x, origin.y, aim)
  }

  private beamEffect(x: number, y: number, angle: number): void {
    const beam = this.ctx.scene.add
      .rectangle(x, y, this.spec.range, this.spec.beamRadius * 2, this.spec.color, 0.55)
      .setOrigin(0, 0.5)
      .setRotation(angle)
      .setDepth(7)
    const core = this.ctx.scene.add
      .rectangle(x, y, this.spec.range, this.spec.beamRadius * 0.7, 0xffffff, 0.95)
      .setOrigin(0, 0.5)
      .setRotation(angle)
      .setDepth(8)
    this.ctx.scene.tweens.add({
      targets: [beam, core],
      alpha: 0,
      scaleY: 0.15,
      duration: 200,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        beam.destroy()
        core.destroy()
      },
    })
  }

  setVisible(on: boolean): void {
    this.hidden = !on
    this.image.setVisible(on)
  }

  destroy(): void {
    this.image.destroy()
  }
}
