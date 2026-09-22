import { DEG2RAD } from '../../util/units'
import type Phaser from 'phaser'
import { sectorHitIndices } from '../../arcade/hit'
import type { SweepDef } from '../../types/abilityDefs'
import { applyEffects } from './effects'
import { emojiImage } from '../../emoji/textures'
import { nearestAngle } from './targeting'
import type { TargetInfo, AbilityContext, AbilityOwner, AbilityRuntime } from './types'

export class SweepAbility implements AbilityRuntime {
  private image: Phaser.GameObjects.Image
  private cooldown: number
  private aim = 0
  /** -1 → 1 */
  private sweep = { t: 1 }
  private tween?: Phaser.Tweens.Tween

  constructor(
    private def: SweepDef,
    private ctx: AbilityContext,
    initialCooldownMs: number,
  ) {
    this.image = emojiImage(ctx.scene, 0, 0, def.held.emoji, def.held.size, ctx.ownerOutline).setDepth(13)
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: AbilityOwner): void {
    this.cooldown -= delta
    const angle = this.aim + (this.sweep.t * this.def.arcDeg * DEG2RAD) / 2
    const dist = this.def.held.restOffset
    this.image.setPosition(owner.x + Math.cos(angle) * dist, owner.y + Math.sin(angle) * dist)
    this.image.setRotation(angle + this.def.held.rotationOffsetDeg * DEG2RAD)

    if (this.cooldown > 0) return
    const targets = this.ctx.targets()
    const aim = nearestAngle(owner, targets, this.def.radius)
    if (aim === null) return
    this.aim = aim
    this.cooldown = this.def.cooldownMs * this.ctx.cooldownMul()

    this.ctx.sfx('whoosh')
    const damage = Math.round(this.def.damage * this.ctx.damageMul())
    const hitRefs: TargetInfo['ref'][] = []
    for (const i of sectorHitIndices(
      { x: owner.x, y: owner.y },
      this.aim,
      this.def.arcDeg * DEG2RAD,
      this.def.radius,
      targets,
    )) {
      this.ctx.damageTarget(targets[i]!.ref, damage, this.def.knockback, owner.x, owner.y)
      hitRefs.push(targets[i]!.ref)
    }
    applyEffects(this.ctx, this.def.onHit, { center: { x: owner.x, y: owner.y }, baseDamage: damage, targets: hitRefs })

    this.tween?.remove()
    this.sweep.t = -1
    this.tween = this.ctx.scene.tweens.add({
      targets: this.sweep,
      t: 1,
      duration: this.def.sweepMs,
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
