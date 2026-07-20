import type Phaser from 'phaser'
import { ACQUIRE } from './registry'
import type { AreaBlastDef } from './defs'
import { applyBlast } from './effects'
import { emojiImage } from '../emoji/textures'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

/** 远程范围轰炸：在侦测范围内以最近敌人为爆心，对爆心圆形区域内所有敌人各一次伤害。
 * 能力：burn 爆心留灼烧地面；echo 延迟向随机敌人追加一次折损轰炸 */
export class AreaBlastAbility implements AbilityRuntime {
  private cooldown: number
  private hidden = false
  /** 连锁轰炸倒计时；≤0 无待发 */
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

    // 连锁轰炸：主炸后向索敌上限内的随机敌人追加（不能轰到无穷远）
    if (this.echoIn > 0) {
      this.echoIn -= delta
      if (this.echoIn <= 0) {
        const targets = this.ctx.targets()
        const max2 = ACQUIRE.range * ACQUIRE.range
        const near = targets.filter((t) => {
          const dx = t.x - owner.x
          const dy = t.y - owner.y
          return dx * dx + dy * dy <= max2
        })
        if (near.length > 0) {
          const t = near[Math.floor(Math.random() * near.length)]!
          this.blastAt(t.x, t.y, this.echoDamage)
        }
      }
    }

    if (this.cooldown > 0) return
    const targets = this.ctx.targets()
    if (targets.length === 0) return

    // 侦测范围内离持有者最近的敌人为爆心
    const detect2 = this.def.detectRange * this.def.detectRange
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
    this.cooldown = this.def.cooldownMs * this.ctx.cooldownMul()

    const damage = Math.round(this.def.damage * this.ctx.damageMul())
    this.blastAt(center.x, center.y, damage)
    if (this.def.echo) {
      this.echoIn = this.def.echo.delayMs
      this.echoDamage = Math.max(1, Math.round(damage * this.def.echo.ratio))
    }
  }

  /** 一次完整爆炸：伤害 + 特效 + 灼烧地面（能力） */
  private blastAt(x: number, y: number, damage: number): void {
    this.ctx.sfx('boom')
    applyBlast(this.ctx, { x, y }, damage, this.def.blastRadius, this.def.knockback)
    if (this.def.burn) {
      this.ctx.spawnGroundEffect(x, y, this.def.burn)
    }
    this.blastEffect(x, y)
  }

  private blastEffect(x: number, y: number): void {
    const scene = this.ctx.scene
    // 白闪核心
    const flash: Phaser.GameObjects.Arc = scene.add
      .circle(x, y, this.def.blastRadius * 0.55, 0xffffff, 0.9)
      .setDepth(8)
    scene.tweens.add({
      targets: flash,
      scale: 1.7,
      alpha: 0,
      duration: 170,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    })
    // 冲击环
    const ring: Phaser.GameObjects.Arc = scene.add
      .circle(x, y, this.def.blastRadius, this.def.color, 0.4)
      .setStrokeStyle(6, this.def.color, 1)
      .setDepth(7)
      .setScale(0.25)
    scene.tweens.add({
      targets: ring,
      scale: 1.08,
      alpha: 0,
      duration: 400,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    })
    // 💥 爆裂
    const boom = emojiImage(scene, x, y, '💥', this.def.blastRadius * 1.5).setDepth(9)
    const full = boom.scale
    boom.setScale(full * 0.4).setRotation((Math.random() - 0.5) * 0.8)
    scene.tweens.add({
      targets: boom,
      scale: full,
      alpha: 0,
      duration: 340,
      ease: 'Back.easeOut',
      onComplete: () => boom.destroy(),
    })
  }

  setVisible(on: boolean): void {
    this.hidden = !on
  }

  destroy(): void {}
}
