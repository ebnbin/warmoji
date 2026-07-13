import type Phaser from 'phaser'
import { circleHitIndices } from '../core/weapons'
import type { AreaBlastSpec } from '../core/weapons'
import type { WeaponContext, WeaponOwner, WeaponRuntime } from './types'

/** 远程范围轰炸：在侦测范围内以最近敌人为爆心，对爆心圆形区域内所有敌人各一次伤害 */
export class AreaBlastWeapon implements WeaponRuntime {
  private cooldown: number
  private hidden = false

  constructor(
    private spec: AreaBlastSpec,
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

    // 侦测范围内离持有者最近的敌人为爆心
    const detect2 = this.spec.detectRange * this.spec.detectRange
    let center: { x: number; y: number } | null = null
    let bestD = detect2
    for (const t of targets) {
      const dx = t.x - owner.x
      const dy = t.y - owner.y
      const d = dx * dx + dy * dy
      if (d <= bestD) {
        bestD = d
        center = { x: t.x, y: t.y }
      }
    }
    if (!center) return
    this.cooldown = this.spec.cooldownMs * this.ctx.cooldownMul()

    const damage = Math.round(this.spec.damage * this.ctx.damageMul())
    for (const i of circleHitIndices(center, this.spec.blastRadius, targets)) {
      this.ctx.damageEnemy(targets[i]!.ref, damage)
    }
    this.blastEffect(center.x, center.y)
  }

  private blastEffect(x: number, y: number): void {
    const ring: Phaser.GameObjects.Arc = this.ctx.scene.add
      .circle(x, y, this.spec.blastRadius, this.spec.color, 0.18)
      .setStrokeStyle(4, this.spec.color, 0.9)
      .setDepth(7)
      .setScale(0.2)
    this.ctx.scene.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0,
      duration: 320,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy(),
    })
  }

  setVisible(on: boolean): void {
    this.hidden = !on
  }

  destroy(): void {}
}
