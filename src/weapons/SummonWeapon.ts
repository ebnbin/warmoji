import type Phaser from 'phaser'
import type { SummonSpec } from '../core/weapons'
import { ACQUIRE } from '../core/config'
import { emojiImage } from '../ui/emoji'
import type { EnemyTarget, WeaponContext, WeaponOwner, WeaponRuntime } from './types'

interface Minion {
  img: Phaser.GameObjects.Image
  /** 命中后的再攻间隔；>0 时退回主人身边盘旋 */
  hitCd: number
  /** 待机盘旋相位（各只错开） */
  phase: number
}

/** 召唤型：常驻一小群独立 AI 的召唤物——追击最近的敌人，撞上即造成伤害，
 * 之后短暂退回主人身边再出击。无敌人时绕主人盘旋。
 * 能力：sting 蜇中减速 */
export class SummonWeapon implements WeaponRuntime {
  private minions: Minion[] = []

  constructor(
    private spec: SummonSpec,
    private ctx: WeaponContext,
    initialCooldownMs: number,
  ) {
    for (let i = 0; i < spec.count; i++) {
      const img = emojiImage(ctx.scene, 0, 0, spec.minion.emoji, spec.minion.size, 'player').setDepth(12)
      this.minions.push({ img, hitCd: initialCooldownMs + i * 150, phase: (i * Math.PI * 2) / spec.count })
    }
  }

  private nearestTarget(x: number, y: number): EnemyTarget | null {
    let best: EnemyTarget | null = null
    let bestD = ACQUIRE.range * ACQUIRE.range
    for (const t of this.ctx.enemyTargets()) {
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

  update(delta: number, owner: WeaponOwner): void {
    const dt = Math.min(delta, 50) / 1000
    const speed = this.spec.minion.speed
    for (const m of this.minions) {
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
        const rr = target.radius + this.spec.minion.size * 0.35
        const tx = target.x - m.img.x
        const ty = target.y - m.img.y
        if (tx * tx + ty * ty <= rr * rr) {
          const damage = Math.round(this.spec.damage * this.ctx.damageMul())
          this.ctx.damageEnemy(target.ref, damage, this.spec.knockback, m.img.x, m.img.y)
          if (this.spec.sting) {
            this.ctx.slowEnemy(target.ref, this.spec.sting.slowFactor, this.spec.sting.slowMs)
          }
          this.ctx.sfx('hit')
          m.hitCd = this.spec.hitCooldownMs * this.ctx.cooldownMul()
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
