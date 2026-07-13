import type Phaser from 'phaser'
import { circleHitIndices } from '../core/weapons'
import type { AreaPulseSpec } from '../core/weapons'
import type { WeaponContext, WeaponOwner, WeaponRuntime } from './types'

/** 范围脉冲型：以角色为圆心，冷却到点对圈内所有敌人各一次伤害，扩散圆环特效 */
export class AreaPulseWeapon implements WeaponRuntime {
  private cooldown: number
  private hidden = false

  constructor(
    private spec: AreaPulseSpec,
    private ctx: WeaponContext,
    initialCooldownMs: number,
  ) {
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: WeaponOwner): void {
    this.cooldown -= delta
    if (this.cooldown > 0 || this.hidden) return
    const targets = this.ctx.enemyTargets()
    if (targets.length === 0) return
    const hits = circleHitIndices({ x: owner.x, y: owner.y }, this.spec.radius, targets)
    if (hits.length === 0) return
    this.cooldown = this.spec.cooldownMs * this.ctx.cooldownMul()

    const damage = Math.round(this.spec.damage * this.ctx.damageMul())
    for (const i of hits) this.ctx.damageEnemy(targets[i]!.ref, damage)
    this.pulseEffect(owner)
  }

  private pulseEffect(owner: WeaponOwner): void {
    const ring: Phaser.GameObjects.Arc = this.ctx.scene.add
      .circle(owner.x, owner.y, this.spec.radius, this.spec.color, 0.12)
      .setStrokeStyle(4, this.spec.color, 0.85)
      .setDepth(7)
      .setScale(0.15)
    this.ctx.scene.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0,
      duration: 350,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy(),
    })
  }

  setVisible(on: boolean): void {
    this.hidden = !on
  }

  destroy(): void {}
}
