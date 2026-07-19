import type { HealSpec } from './spec'
import type { WeaponContext, WeaponOwner, WeaponRuntime } from './types'

/** 治疗型：周期治疗范围内血量比例最低的队友（对友军索敌）。
 * 能力：aoe 群体处方（范围全体按比例回复）；defib 电击起搏
 *（范围内有阵亡队友时优先减其复活倒计时）。治疗量吃伤害倍率——
 * 磨刀石对军医同样有意义 */
export class HealWeapon implements WeaponRuntime {
  private cooldown: number

  constructor(
    private spec: HealSpec,
    private ctx: WeaponContext,
    initialCooldownMs: number,
  ) {
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: WeaponOwner): void {
    this.cooldown -= delta
    if (this.cooldown > 0) return

    // 电击起搏优先：救倒下的比奶站着的更急
    if (this.spec.defib && this.ctx.cutReviveTimer?.(owner.x, owner.y, this.spec.range, this.spec.defib.reviveCutMs)) {
      this.cooldown = this.spec.cooldownMs * this.ctx.cooldownMul()
      this.pulse(owner, 0xfff176)
      this.ctx.sfx('zap')
      return
    }

    const amount = Math.max(1, Math.round(this.spec.amount * this.ctx.damageMul()))
    const healed = this.spec.aoe
      ? this.ctx.heal(owner.x, owner.y, this.spec.range, Math.max(1, Math.round(amount * this.spec.aoe.ratio)), true)
      : this.ctx.heal(owner.x, owner.y, this.spec.range, amount, false)
    if (healed > 0) {
      this.cooldown = this.spec.cooldownMs * this.ctx.cooldownMul()
      this.pulse(owner, 0x81c784)
      this.ctx.sfx('upgrade')
    } else {
      // 全员满血：小步重试，不空耗完整冷却
      this.cooldown = 300
    }
  }

  /** 治疗脉冲环 */
  private pulse(owner: WeaponOwner, color: number): void {
    const ring = this.ctx.scene.add
      .circle(owner.x, owner.y, this.spec.range, color, 0.08)
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
