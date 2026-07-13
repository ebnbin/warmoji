import type Phaser from 'phaser'
import type { Point } from '../core/vec'
import { thrustHitIndices } from '../core/weapons'
import type { ThrustSpec } from '../core/weapons'
import { emojiImage } from '../ui/emoji'
import type { WeaponContext, WeaponRuntime } from './types'

/** 突刺型：持有物朝最近敌人方向挥出再收回，胶囊判定内每敌一次伤害 */
export class ThrustWeapon implements WeaponRuntime {
  private image: Phaser.GameObjects.Image
  private cooldown: number
  private aim = 0
  private lunge = { t: 0 }
  private tween?: Phaser.Tweens.Tween

  constructor(
    private spec: ThrustSpec,
    private ctx: WeaponContext,
    initialCooldownMs: number,
  ) {
    this.image = emojiImage(ctx.scene, 0, 0, spec.emoji, spec.size, true).setDepth(13)
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: Point): void {
    this.cooldown -= delta
    const dist = this.spec.restOffset + this.lunge.t * (this.spec.reach - this.spec.restOffset)
    this.image.setPosition(
      owner.x + Math.cos(this.aim) * dist,
      owner.y + Math.sin(this.aim) * dist,
    )
    this.image.setRotation(this.aim + this.spec.rotationOffsetRad)

    if (this.cooldown > 0) return
    const targets = this.ctx.enemyTargets()
    if (targets.length === 0) return
    this.cooldown = this.spec.cooldownMs * this.ctx.cooldownMul()

    // 瞄准离自己最近的敌人
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
    for (const i of thrustHitIndices(owner, this.aim, this.spec.reach, this.spec.hitRadius, targets)) {
      this.ctx.damageEnemy(targets[i]!.ref, damage)
    }

    this.tween?.remove()
    this.lunge.t = 0
    this.tween = this.ctx.scene.tweens.add({
      targets: this.lunge,
      t: 1,
      duration: this.spec.thrustMs / 2,
      yoyo: true,
      ease: 'Sine.easeOut',
    })
  }

  setVisible(on: boolean): void {
    this.image.setVisible(on)
    if (!on) {
      this.tween?.remove()
      this.lunge.t = 0
    }
  }

  destroy(): void {
    this.tween?.remove()
    this.image.destroy()
  }
}
