import { ACQUIRE } from '../../data/abilities'
import { UNIT } from '../../util/units'
import type { AreaBlastDef } from '../../types/abilityDefs'
import { applyBlast, applyEffects } from './effects'
import { boomCue, circleCue } from '../cues'
import { nearestTarget, targetsWithin } from './targeting'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

export class AreaBlastAbility implements AbilityRuntime {
  private cooldown: number
  private hidden = false
  /** ≤0 无待发 */
  private echoIn = 0
  private echoDamage = 0

  constructor(
    private def: AreaBlastDef,
    private ctx: AbilityContext,
    initialCooldownMs: number,
  ) {
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: AbilityOwner): void {
    this.cooldown -= delta
    if (this.hidden) return

    if (this.echoIn > 0) {
      this.echoIn -= delta
      if (this.echoIn <= 0) {
        const near = targetsWithin(owner.x, owner.y, this.ctx.targets(), ACQUIRE.range * UNIT)
        if (near.length > 0) {
          const t = near[Math.floor(Math.random() * near.length)]!
          this.blastAt(t.x, t.y, this.echoDamage)
        }
      }
    }

    if (this.cooldown > 0) return
    const center = nearestTarget(owner.x, owner.y, this.ctx.targets(), this.def.detectRange)
    if (!center) return
    this.cooldown = this.def.cooldownMs * this.ctx.cooldownMul()

    const damage = Math.round(this.def.damage * this.ctx.damageMul())
    this.blastAt(center.x, center.y, damage)
    if (this.def.echo) {
      this.echoIn = this.def.echo.delayMs
      this.echoDamage = Math.max(1, Math.round(damage * this.def.echo.ratio))
    }
  }

  private blastAt(x: number, y: number, damage: number): void {
    this.ctx.sfx('boom')
    applyBlast(this.ctx, { x, y }, damage, this.def.blastRadius, this.def.knockback)
    applyEffects(this.ctx, this.def.onHit, { center: { x, y }, baseDamage: damage })
    this.blastEffect(x, y)
  }

  private blastEffect(x: number, y: number): void {
    const scene = this.ctx.scene
    circleCue(scene, x, y, this.def.blastRadius * 0.55, {
      fill: 0xffffff,
      fillAlpha: 0.9,
      fromScale: 1,
      toScale: 1.7,
      durationMs: 170,
      depth: 8,
    })
    circleCue(scene, x, y, this.def.blastRadius, {
      fill: this.def.color,
      fillAlpha: 0.4,
      stroke: this.def.color,
      lineWidth: 6,
      lineAlpha: 1,
      fromScale: 0.25,
      toScale: 1.08,
      durationMs: 400,
      depth: 7,
    })
    boomCue(scene, x, y, this.def.blastRadius * 1.5)
  }

  setVisible(on: boolean): void {
    this.hidden = !on
  }

  destroy(): void {}
}
