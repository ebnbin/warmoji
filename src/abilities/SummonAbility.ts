import type Phaser from 'phaser'
import type { SummonDef } from './defs'
import { ACQUIRE } from './registry'
import { ANIM_DEF } from '../emoji/studio'
import { Animator } from '../emoji/animator'
import { clipFramesLive } from '../emoji/animTextures'
import { emojiImage } from '../emoji/textures'
import type { TargetInfo, AbilityContext, AbilityOwner, AbilityRuntime } from './types'

interface Minion {
  img: Phaser.GameObjects.Image
  /** 命中后的再攻间隔；>0 时退回主人身边盘旋 */
  hitCd: number
  /** 待机盘旋相位（各只错开） */
  phase: number
  anim: Animator
}

/** 召唤型：常驻一小群独立 AI 的召唤物——追击最近的敌人，撞上即造成伤害，
 * 之后短暂退回主人身边再出击。无敌人时绕主人盘旋。
 * 能力：sting 蜇中减速 */
export class SummonAbility implements AbilityRuntime {
  private minions: Minion[] = []
  /** 动画时钟：delta 累积（暂停即停帧） */
  private clock = 0

  constructor(
    private def: SummonDef,
    private ctx: AbilityContext,
    initialCooldownMs: number,
  ) {
    const frames = clipFramesLive(ctx.scene, def.minion.emoji, 'idle', ctx.ownerOutline)
    for (let i = 0; i < def.count; i++) {
      const img = emojiImage(ctx.scene, 0, 0, def.minion.emoji, def.minion.size, ctx.ownerOutline).setDepth(12)
      const anim = new Animator(img)
      anim.register('idle', frames)
      anim.setIdle('idle', ANIM_DEF.durMs, (i * ANIM_DEF.durMs) / def.count)
      this.minions.push({
        img,
        hitCd: initialCooldownMs + i * 150,
        phase: (i * Math.PI * 2) / def.count,
        anim,
      })
    }
  }

  private nearestTarget(x: number, y: number): TargetInfo | null {
    let best: TargetInfo | null = null
    let bestD = ACQUIRE.range * ACQUIRE.range
    for (const t of this.ctx.targets()) {
      const dx = t.x - x
      const dy = t.y - y
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = t
      }
    }
    return best
  }

  update(delta: number, owner: AbilityOwner): void {
    this.clock += delta
    const dt = Math.min(delta, 50) / 1000
    const speed = this.def.minion.speed
    for (const m of this.minions) {
      m.anim.update(this.clock)
      m.hitCd -= delta
      m.phase += dt * 2.4
      const target = m.hitCd <= 0 ? this.nearestTarget(m.img.x, m.img.y) : null
      // 目的地：出击 = 敌人；否则回主人身边的盘旋位
      const dest = target
        ? { x: target.x, y: target.y }
        : {
            x: owner.x + Math.cos(m.phase) * 46,
            y: owner.y + Math.sin(m.phase) * 46 - 10,
          }
      const dx = dest.x - m.img.x
      const dy = dest.y - m.img.y
      const d = Math.hypot(dx, dy)
      const step = speed * dt
      if (d <= step) m.img.setPosition(dest.x, dest.y)
      else m.img.setPosition(m.img.x + (dx / d) * step, m.img.y + (dy / d) * step)
      m.img.setFlipX(dx < 0)

      if (target) {
        const rr = target.radius + this.def.minion.size * 0.35
        const tx = target.x - m.img.x
        const ty = target.y - m.img.y
        if (tx * tx + ty * ty <= rr * rr) {
          const damage = Math.round(this.def.damage * this.ctx.damageMul())
          this.ctx.damageTarget(target.ref, damage, this.def.knockback, m.img.x, m.img.y)
          if (this.def.sting) {
            this.ctx.slowTarget(target.ref, this.def.sting.slowFactor, this.def.sting.slowMs)
          }
          this.ctx.sfx('hit')
          m.hitCd = this.def.hitCooldownMs * this.ctx.cooldownMul()
        }
      }
    }
  }

  setVisible(on: boolean): void {
    for (const m of this.minions) m.img.setVisible(on)
  }

  destroy(): void {
    for (const m of this.minions) m.img.destroy()
    this.minions = []
  }
}
