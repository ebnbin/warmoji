import type { HealDef } from '../../types/abilityDefs'
import { circleCue } from '../cues'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

/** 治疗量吃伤害倍率 */
export class HealAbility implements AbilityRuntime {
  private cooldown: number

  constructor(
    private def: HealDef,
    private ctx: AbilityContext,
    initialCooldownMs: number,
  ) {
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: AbilityOwner): void {
    this.cooldown -= delta
    if (this.cooldown > 0) return

    // 电击起搏优先
    if (this.def.defib && this.ctx.cutReviveTimer?.(owner.x, owner.y, this.def.range, this.def.defib.reviveCutMs)) {
      this.cooldown = this.def.cooldownMs * this.ctx.cooldownMul()
      this.pulse(owner, 0xfff176)
      this.ctx.sfx('zap')
      return
    }

    const amount = Math.max(1, Math.round(this.def.amount * this.ctx.damageMul()))
    const healed = this.def.aoe
      ? this.ctx.heal(owner.x, owner.y, this.def.range, Math.max(1, Math.round(amount * this.def.aoe.ratio)), true)
      : this.ctx.heal(owner.x, owner.y, this.def.range, amount, false)
    if (healed > 0) {
      this.cooldown = this.def.cooldownMs * this.ctx.cooldownMul()
      this.pulse(owner, 0x81c784)
      this.ctx.sfx('upgrade')
    } else {
      // 全员满血时小步重试
      this.cooldown = 300
    }
  }

  private pulse(owner: AbilityOwner, color: number): void {
    circleCue(this.ctx.scene, owner.x, owner.y, this.def.range, {
      fill: color,
      fillAlpha: 0.08,
      stroke: color,
      lineWidth: 3,
      lineAlpha: 0.7,
      fromScale: 0.25,
      toScale: 1,
      durationMs: 420,
      depth: 6,
    })
  }

  setVisible(_on: boolean): void {
    void _on
  }

  destroy(): void {}
}
