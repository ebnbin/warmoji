import type Phaser from 'phaser'
import { sectorHitIndices } from './spec'
import type { SweepSpec } from './spec'
import { emojiImage } from '../emoji/textures'
import { nearestAngle } from './types'
import type { WeaponContext, WeaponOwner, WeaponRuntime } from './types'

/** 横扫型：持有物绕角色扫过一段圆弧，扇形判定内每敌一次伤害 */
export class SweepWeapon implements WeaponRuntime {
  private image: Phaser.GameObjects.Image
  private cooldown: number
  private aim = 0
  /** -1 → 1：从弧的一端扫到另一端 */
  private sweep = { t: 1 }
  private tween?: Phaser.Tweens.Tween

  constructor(
    private spec: SweepSpec,
    private ctx: WeaponContext,
    initialCooldownMs: number,
  ) {
    this.image = emojiImage(ctx.scene, 0, 0, spec.held.emoji, spec.held.size, ctx.ownerOutline).setDepth(13)
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: WeaponOwner): void {
    this.cooldown -= delta
    const angle = this.aim + (this.sweep.t * this.spec.arcRad) / 2
    const dist = this.spec.held.restOffset
    this.image.setPosition(owner.x + Math.cos(angle) * dist, owner.y + Math.sin(angle) * dist)
    this.image.setRotation(angle + this.spec.held.rotationOffsetRad)

    if (this.cooldown > 0) return
    const targets = this.ctx.targets()
    const aim = nearestAngle(owner, targets)
    if (aim === null) return
    this.aim = aim
    this.cooldown = this.spec.cooldownMs * this.ctx.cooldownMul()

    this.ctx.sfx('whoosh')
    const damage = Math.round(this.spec.damage * this.ctx.damageMul())
    for (const i of sectorHitIndices(
      { x: owner.x, y: owner.y },
      this.aim,
      this.spec.arcRad,
      this.spec.radius,
      targets,
    )) {
      this.ctx.damageTarget(targets[i]!.ref, damage, this.spec.knockback, owner.x, owner.y)
      // 震慑余波：被扫中的敌人限时减速
      if (this.spec.slowOnHit) {
        this.ctx.slowTarget(targets[i]!.ref, this.spec.slowOnHit.factor, this.spec.slowOnHit.durationMs)
      }
    }

    this.tween?.remove()
    this.sweep.t = -1
    this.tween = this.ctx.scene.tweens.add({
      targets: this.sweep,
      t: 1,
      duration: this.spec.sweepMs,
      ease: 'Sine.easeInOut',
    })
  }

  setVisible(on: boolean): void {
    this.image.setVisible(on)
    if (!on) this.tween?.remove()
  }

  destroy(): void {
    this.tween?.remove()
    this.image.destroy()
  }
}
