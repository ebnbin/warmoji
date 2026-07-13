import type Phaser from 'phaser'
import type { SlowAuraSpec } from '../core/weapons'
import type { WeaponContext, WeaponRuntime } from './types'

/** 寒气光环：以队伍中心为圆心持续减速（角色只是来源；角色阵亡光环随之消失） */
export class SlowAuraWeapon implements WeaponRuntime {
  private ring: Phaser.GameObjects.Arc
  private hidden = false

  constructor(
    private spec: SlowAuraSpec,
    private ctx: WeaponContext,
    initialCooldownMs: number,
  ) {
    // 光环持续生效，无冷却概念
    void initialCooldownMs
    this.ring = ctx.scene.add
      .circle(0, 0, spec.radius, spec.color, 0.08)
      .setStrokeStyle(2, spec.color, 0.35)
      .setDepth(2)
  }

  update(): void {
    if (this.hidden) return
    const c = this.ctx.teamCenter()
    this.ring.setPosition(c.x, c.y)
    this.ctx.applySlow(c.x, c.y, this.spec.radius, this.spec.slowFactor)
  }

  setVisible(on: boolean): void {
    this.hidden = !on
    this.ring.setVisible(on)
  }

  destroy(): void {
    this.ring.destroy()
  }
}
