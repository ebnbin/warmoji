import { DEG2RAD } from '../../util/units'
import type Phaser from 'phaser'
import { thrustHitIndices } from '../../arcade/hit'
import type { LaserDef } from '../../types/abilityDefs'
import { emojiImage } from '../../emoji/textures'
import { beamCue } from '../cues'
import { nearestAngle } from './targeting'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

export class LaserAbility implements AbilityRuntime {
  private image: Phaser.GameObjects.Image
  private cooldown: number
  private aim = 0
  private hidden = false
  /** 内部时钟驱动 */
  private radialQueue: { angle: number; at: number }[] = []
  private clock = 0

  constructor(
    private def: LaserDef,
    private ctx: AbilityContext,
    initialCooldownMs: number,
  ) {
    this.image = emojiImage(ctx.scene, 0, 0, def.held.emoji, def.held.size, ctx.ownerOutline).setDepth(13)
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: AbilityOwner): void {
    this.cooldown -= delta
    this.clock += delta
    const held = this.def.held
    this.image.setPosition(
      owner.x + Math.cos(this.aim) * held.restOffset,
      owner.y + Math.sin(this.aim) * held.restOffset,
    )
    this.image.setRotation(this.aim + held.rotationOffsetDeg * DEG2RAD)

    if (this.radialQueue.length > 0 && !this.hidden) {
      const ratio = this.def.radial?.ratio ?? 1
      while (this.radialQueue.length > 0 && this.radialQueue[0]!.at <= this.clock) {
        const shot = this.radialQueue.shift()!
        this.aim = shot.angle
        this.fireBeam(owner, shot.angle, ratio)
      }
      return
    }

    if (this.cooldown > 0 || this.hidden) return
    const aim = nearestAngle(owner, this.ctx.targets(), this.def.range)
    if (aim === null) return
    this.aim = aim
    this.cooldown = this.def.cooldownMs * this.ctx.cooldownMul()

    if (this.def.radial) {
      const { beams, stepMs } = this.def.radial
      for (let k = 0; k < beams; k++) {
        this.radialQueue.push({ angle: aim + (k * 2 * Math.PI) / beams, at: this.clock + k * stepMs })
      }
      return
    }

    this.fireBeam(owner, aim, 1)
    if (this.def.backBeam) this.fireBeam(owner, aim + Math.PI, 1)
  }

  /** ratio 为扫射分束的折损 */
  private fireBeam(owner: AbilityOwner, angle: number, ratio: number): void {
    this.ctx.sfx('zap')
    const damage = Math.max(1, Math.round(this.def.damage * this.ctx.damageMul() * ratio))
    const origin = { x: owner.x, y: owner.y }
    const targets = this.ctx.targets()
    for (const i of thrustHitIndices(origin, angle, this.def.range, this.def.beamRadius, targets)) {
      this.ctx.damageTarget(targets[i]!.ref, damage, this.def.knockback, origin.x, origin.y)
    }
    beamCue(this.ctx.scene, origin.x, origin.y, angle, this.def.range, this.def.beamRadius, this.def.color)
  }

  setVisible(on: boolean): void {
    this.hidden = !on
    this.image.setVisible(on)
    if (!on) this.radialQueue.length = 0
  }

  destroy(): void {
    this.image.destroy()
  }
}
