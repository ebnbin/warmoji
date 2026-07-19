import type { HealDef } from './defs'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

/** 治疗型：周期治疗范围内血量比例最低的队友（对友军索敌）。
 * 能力：aoe 群体处方（范围全体按比例回复）；defib 电击起搏
 *（范围内有阵亡队友时优先减其复活倒计时）。治疗量吃伤害倍率——
 * 磨刀石对军医同样有意义 */
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

    // 电击起搏优先：救倒下的比奶站着的更急
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
      // 全员满血：小步重试，不空耗完整冷却
      this.cooldown = 300
    }
  }

  /** 治疗脉冲环 */
  private pulse(owner: AbilityOwner, color: number): void {
    const ring = this.ctx.scene.add
      .circle(owner.x, owner.y, this.def.range, color, 0.08)
      .setStrokeStyle(3, color, 0.7)
      .setDepth(6)
      .setScale(0.25)
    this.ctx.scene.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    })
  }

  setVisible(_on: boolean): void {
    void _on
  }

  destroy(): void {}
}
