import type Phaser from 'phaser'
import { circleHitIndices, thrustHitIndices } from '../core/weapons'
import type { ThrustSpec } from '../core/weapons'
import { emojiImage } from '../ui/emoji'
import { nearestAngle } from './types'
import type { WeaponContext, WeaponOwner, WeaponRuntime } from './types'

/** 突刺型：held 时持有物挥出收回；无 held 时角色本体前冲收回。胶囊判定内每敌一次伤害。
 * 能力：combo 出手后短暂延迟重新索敌再刺一段；tipBurst 突刺终点圆形震波 */
export class ThrustWeapon implements WeaponRuntime {
  private image?: Phaser.GameObjects.Image
  private cooldown: number
  private aim = 0
  private lunge = { t: 0 }
  private tween?: Phaser.Tweens.Tween
  /** 二连突的第二段倒计时；≤0 无待发 */
  private comboIn = 0

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

    // 二连突：主刺后隔 delayMs 重新索敌补第二段（不吃冷却）
    if (this.comboIn > 0) {
      this.comboIn -= delta
      if (this.comboIn <= 0) this.strike(owner)
      return
    }

    if (this.cooldown > 0) return
    const targets = this.ctx.enemyTargets()
    if (nearestAngle(owner, targets) === null) return
    this.cooldown = this.spec.cooldownMs * this.ctx.cooldownMul()
    this.strike(owner)
    if (this.spec.combo) this.comboIn = this.spec.combo.delayMs
  }

  /** 单段突刺：索敌 → 胶囊判定 → 终点震波（能力）→ 挥出动画 */
  private strike(owner: WeaponOwner): void {
    const targets = this.ctx.enemyTargets()
    const aim = nearestAngle(owner, targets)
    if (aim === null) return
    this.aim = aim

    this.ctx.sfx('whoosh')
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

    const burst = this.spec.tipBurst
    if (burst) {
      const tipX = owner.x + Math.cos(this.aim) * this.spec.reach
      const tipY = owner.y + Math.sin(this.aim) * this.spec.reach
      const burstDamage = Math.max(1, Math.round(damage * burst.ratio))
      for (const i of circleHitIndices({ x: tipX, y: tipY }, burst.radius, targets)) {
        this.ctx.damageEnemy(targets[i]!.ref, burstDamage, burst.knockback, tipX, tipY)
      }
      const ring = this.ctx.scene.add
        .circle(tipX, tipY, burst.radius, burst.color, 0.3)
        .setStrokeStyle(4, burst.color, 0.9)
        .setDepth(7)
        .setScale(0.3)
      this.ctx.scene.tweens.add({
        targets: ring,
        scale: 1,
        alpha: 0,
        duration: 260,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy(),
      })
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
      this.comboIn = 0
    }
  }

  destroy(): void {
    this.tween?.remove()
    this.image?.destroy()
  }
}
