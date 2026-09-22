import type Phaser from 'phaser'
import type { SlowAuraDef } from '../../types/abilityDefs'
import { circleCue } from '../cues'
import type { AbilityContext, AbilityRuntime } from './types'

/** 圆心为队伍中心；角色阵亡光环随之消失 */
export class SlowAuraAbility implements AbilityRuntime {
  private ring: Phaser.GameObjects.Arc
  private hidden = false
  /** 冻伤跳伤间隔 */
  private static readonly TICK_MS = 500
  private tickIn = SlowAuraAbility.TICK_MS
  private freezeIn: number

  constructor(
    private def: SlowAuraDef,
    private ctx: AbilityContext,
    initialCooldownMs: number,
  ) {
    // 光环无冷却概念
    void initialCooldownMs
    this.freezeIn = def.freeze?.intervalMs ?? 0
    this.ring = ctx.scene.add
      .circle(0, 0, def.radius, def.color, 0.08)
      .setStrokeStyle(2, def.color, 0.35)
      .setDepth(2)
  }

  update(delta: number): void {
    if (this.hidden) return
    const c = this.ctx.anchor()
    this.ring.setPosition(c.x, c.y)
    this.ctx.applySlow(c.x, c.y, this.def.radius, this.def.slowFactor)

    const r2 = this.def.radius * this.def.radius
    if (this.def.dps) {
      this.tickIn -= delta
      if (this.tickIn <= 0) {
        this.tickIn += SlowAuraAbility.TICK_MS
        const damage = Math.max(
          1,
          Math.round(((this.def.dps * SlowAuraAbility.TICK_MS) / 1000) * this.ctx.damageMul()),
        )
        for (const t of this.ctx.targets()) {
          const dx = t.x - c.x
          const dy = t.y - c.y
          if (dx * dx + dy * dy <= r2) this.ctx.damageTarget(t.ref, damage)
        }
      }
    }

    if (this.def.freeze) {
      this.freezeIn -= delta
      if (this.freezeIn <= 0) {
        this.freezeIn += this.def.freeze.intervalMs
        for (const t of this.ctx.targets()) {
          const dx = t.x - c.x
          const dy = t.y - c.y
          if (dx * dx + dy * dy <= r2) this.ctx.slowTarget(t.ref, 0, this.def.freeze.durationMs)
        }
        circleCue(this.ctx.scene, c.x, c.y, this.def.radius, {
          fill: 0xffffff,
          fillAlpha: 0.18,
          stroke: this.def.color,
          lineWidth: 4,
          lineAlpha: 0.9,
          fromScale: 0.2,
          toScale: 1,
          durationMs: 420,
          depth: 7,
        })
      }
    }
  }

  setVisible(on: boolean): void {
    this.hidden = !on
    this.ring.setVisible(on)
  }

  destroy(): void {
    this.ring.destroy()
  }
}
