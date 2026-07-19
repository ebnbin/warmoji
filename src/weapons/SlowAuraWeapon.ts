import type Phaser from 'phaser'
import type { SlowAuraSpec } from './spec'
import type { WeaponContext, WeaponRuntime } from './types'

/** 寒气光环：以队伍中心为圆心持续减速（角色只是来源；角色阵亡光环随之消失）。
 * 能力：dps 光环内持续掉血（雪人的输出手段）；freeze 周期脉冲冻结 */
export class SlowAuraWeapon implements WeaponRuntime {
  private ring: Phaser.GameObjects.Arc
  private hidden = false
  /** 冻伤跳伤间隔（半秒一跳，dps 折半） */
  private static readonly TICK_MS = 500
  private tickIn = SlowAuraWeapon.TICK_MS
  private freezeIn: number

  constructor(
    private spec: SlowAuraSpec,
    private ctx: WeaponContext,
    initialCooldownMs: number,
  ) {
    // 光环持续生效，无冷却概念
    void initialCooldownMs
    this.freezeIn = spec.freeze?.intervalMs ?? 0
    this.ring = ctx.scene.add
      .circle(0, 0, spec.radius, spec.color, 0.08)
      .setStrokeStyle(2, spec.color, 0.35)
      .setDepth(2)
  }

  update(delta: number): void {
    if (this.hidden) return
    const c = this.ctx.anchor()
    this.ring.setPosition(c.x, c.y)
    this.ctx.applySlow(c.x, c.y, this.spec.radius, this.spec.slowFactor)

    const r2 = this.spec.radius * this.spec.radius
    // 冻伤：周期性对光环内敌人跳伤
    if (this.spec.dps) {
      this.tickIn -= delta
      if (this.tickIn <= 0) {
        this.tickIn += SlowAuraWeapon.TICK_MS
        const damage = Math.max(
          1,
          Math.round(((this.spec.dps * SlowAuraWeapon.TICK_MS) / 1000) * this.ctx.damageMul()),
        )
        for (const t of this.ctx.targets()) {
          const dx = t.x - c.x
          const dy = t.y - c.y
          if (dx * dx + dy * dy <= r2) this.ctx.damageTarget(t.ref, damage)
        }
      }
    }

    // 凛冬降临：周期脉冲冻结光环内敌人
    if (this.spec.freeze) {
      this.freezeIn -= delta
      if (this.freezeIn <= 0) {
        this.freezeIn += this.spec.freeze.intervalMs
        for (const t of this.ctx.targets()) {
          const dx = t.x - c.x
          const dy = t.y - c.y
          if (dx * dx + dy * dy <= r2) this.ctx.slowTarget(t.ref, 0, this.spec.freeze.durationMs)
        }
        const pulse = this.ctx.scene.add
          .circle(c.x, c.y, this.spec.radius, 0xffffff, 0.18)
          .setStrokeStyle(4, this.spec.color, 0.9)
          .setDepth(7)
          .setScale(0.2)
        this.ctx.scene.tweens.add({
          targets: pulse,
          scale: 1,
          alpha: 0,
          duration: 420,
          ease: 'Cubic.easeOut',
          onComplete: () => pulse.destroy(),
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
