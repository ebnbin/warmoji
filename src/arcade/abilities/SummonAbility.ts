import type Phaser from 'phaser'
import type { SummonDef } from '../../data/abilityDefs'
import { applyEffects } from './effects'
import { ACQUIRE } from '../../data/abilities'
import { UNIT } from '../../core/units'
import { ANIM_DEF } from '../../emoji/studio'
import { Animator } from '../../war/anim/animator'
import { clipFramesLive } from '../../war/anim/animTextures'
import { emojiImage } from '../../emoji/textures'
import type { TargetInfo, AbilityContext, AbilityOwner, AbilityRuntime } from './types'

interface Bee {
  img: Phaser.GameObjects.Image
  anim: Animator
  age: number
  phase: number
  dead: boolean
}

/** 放蜂型（蜂后）：每隔 intervalMs 放出一波 count 只小蜂——各自寻路扑向最近的敌人
 * （优先未中毒者，好把毒摊开），撞上即造成撞击直伤 + onHit 毒素随即自毁；一直没撞到
 * 则到寿命(lifeMs)消散。毒 = onHit 的 poison 效果（每秒一跳、持续数秒的 DoT）。 */
export class SummonAbility implements AbilityRuntime {
  private bees: Bee[] = []
  /** 动画时钟：delta 累积（暂停即停帧） */
  private clock = 0
  /** 距下一波放蜂的倒计时 */
  private waveCd: number
  private readonly frames: string[]
  private visible = true

  constructor(
    private def: SummonDef,
    private ctx: AbilityContext,
    initialCooldownMs: number,
  ) {
    this.frames = clipFramesLive(ctx.scene, def.minion.emoji, 'idle', ctx.ownerOutline)
    this.waveCd = initialCooldownMs
  }

  private spawnWave(owner: AbilityOwner): void {
    for (let i = 0; i < this.def.count; i++) {
      const img = emojiImage(this.ctx.scene, owner.x, owner.y, this.def.minion.emoji, this.def.minion.size, this.ctx.ownerOutline)
        .setDepth(12)
        .setVisible(this.visible)
      const anim = new Animator(img)
      anim.register('idle', this.frames)
      anim.setIdle('idle', ANIM_DEF.durMs, (i * ANIM_DEF.durMs) / this.def.count)
      this.bees.push({ img, anim, age: 0, phase: (i * Math.PI * 2) / this.def.count, dead: false })
    }
  }

  /** 优先未中毒的最近敌人；没有未中毒者则退而求其次取最近敌人 */
  private pickTarget(bx: number, by: number): TargetInfo | null {
    const targets = this.ctx.targets()
    const max = ACQUIRE.range * UNIT
    let bestFresh: TargetInfo | null = null
    let bestFreshD = max * max
    let bestAny: TargetInfo | null = null
    let bestAnyD = max * max
    const isPoisoned = this.ctx.isPoisoned
    for (const t of targets) {
      const dx = t.x - bx
      const dy = t.y - by
      const d = dx * dx + dy * dy
      if (d < bestAnyD) {
        bestAnyD = d
        bestAny = t
      }
      if (!isPoisoned?.(t.ref) && d < bestFreshD) {
        bestFreshD = d
        bestFresh = t
      }
    }
    return bestFresh ?? bestAny
  }

  update(delta: number, owner: AbilityOwner): void {
    this.clock += delta
    const dt = Math.min(delta, 50) / 1000
    const speed = this.def.minion.speed

    this.waveCd -= delta
    if (this.waveCd <= 0) {
      this.spawnWave(owner)
      this.waveCd = this.def.intervalMs * this.ctx.cooldownMul()
    }

    for (const b of this.bees) {
      b.anim.update(this.clock)
      b.age += delta
      if (b.age >= this.def.lifeMs) {
        b.dead = true
        b.img.destroy()
        continue
      }

      const target = this.pickTarget(b.img.x, b.img.y)
      b.phase += dt * 3
      // 有目标就扑过去；没目标就在主人身边打转候敌
      const dest = target
        ? { x: target.x, y: target.y }
        : { x: owner.x + Math.cos(b.phase) * 40, y: owner.y + Math.sin(b.phase) * 40 - 8 }
      const dx = dest.x - b.img.x
      const dy = dest.y - b.img.y
      const d = Math.hypot(dx, dy)
      const step = speed * dt
      if (d > step) b.img.setPosition(b.img.x + (dx / d) * step, b.img.y + (dy / d) * step)
      else b.img.setPosition(dest.x, dest.y)
      b.img.setFlipX(dx < 0)

      if (target) {
        const rr = target.radius + this.def.minion.size * 0.35
        const tx = target.x - b.img.x
        const ty = target.y - b.img.y
        if (tx * tx + ty * ty <= rr * rr) {
          // 撞上：撞击直伤 + 施毒(onHit)，随即自毁
          const damage = Math.round(this.def.damage * this.ctx.damageMul())
          this.ctx.damageTarget(target.ref, damage, this.def.knockback, b.img.x, b.img.y)
          applyEffects(this.ctx, this.def.onHit, {
            center: { x: target.x, y: target.y },
            baseDamage: damage,
            targets: [target.ref],
          })
          this.ctx.sfx('hit')
          b.dead = true
          b.img.destroy()
        }
      }
    }
    if (this.bees.some((b) => b.dead)) this.bees = this.bees.filter((b) => !b.dead)
  }

  setVisible(on: boolean): void {
    this.visible = on
    for (const b of this.bees) b.img.setVisible(on)
  }

  destroy(): void {
    for (const b of this.bees) b.img.destroy()
    this.bees = []
  }
}
