import type Phaser from 'phaser'
import { thrustHitIndices } from '../core/weapons'
import type { ThrustSpec } from '../core/weapons'
import { emojiImage } from '../ui/emoji'
import { nearestAngle } from './types'
import type { WeaponContext, WeaponOwner, WeaponRuntime } from './types'

/** 突刺型：held 时持有物挥出收回；无 held 时角色本体前冲收回。胶囊判定内每敌一次伤害 */
export class ThrustWeapon implements WeaponRuntime {
  private image?: Phaser.GameObjects.Image
  private cooldown: number
  private aim = 0
  private lunge = { t: 0 }
  private tween?: Phaser.Tweens.Tween

  constructor(
    private spec: ThrustSpec,
    private ctx: WeaponContext,
    initialCooldownMs: number,
  ) {
    if (spec.held) {
      this.image = emojiImage(ctx.scene, 0, 0, spec.held.emoji, spec.held.size, 'player').setDepth(13)
    }
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: WeaponOwner): void {
    this.cooldown -= delta
    if (this.spec.held && this.image) {
      const dist =
        this.spec.held.restOffset + this.lunge.t * (this.spec.reach - this.spec.held.restOffset)
      this.image.setPosition(owner.x + Math.cos(this.aim) * dist, owner.y + Math.sin(this.aim) * dist)
      this.image.setRotation(this.aim + this.spec.held.rotationOffsetRad)
    } else {
      owner.setVisualOffset(
        Math.cos(this.aim) * this.lunge.t * this.spec.lungeDist,
        Math.sin(this.aim) * this.lunge.t * this.spec.lungeDist,
      )
    }

    if (this.cooldown > 0) return
    const targets = this.ctx.enemyTargets()
    const aim = nearestAngle(owner, targets)
    if (aim === null) return
    this.aim = aim
    this.cooldown = this.spec.cooldownMs * this.ctx.cooldownMul()

    const damage = Math.round(this.spec.damage * this.ctx.damageMul())
    for (const i of thrustHitIndices(
      { x: owner.x, y: owner.y },
      this.aim,
      this.spec.reach,
      this.spec.hitRadius,
      targets,
    )) {
      this.ctx.damageEnemy(targets[i]!.ref, damage, this.spec.knockback, owner.x, owner.y)
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
    this.image?.setVisible(on)
    if (!on) {
      this.tween?.remove()
      this.lunge.t = 0
    }
  }

  destroy(): void {
    this.tween?.remove()
    this.image?.destroy()
  }
}
