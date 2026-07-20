import type { ChainArcDef } from './defs'
import { applyEffects } from './effects'
import { nearestTarget } from './targeting'
import type { TargetInfo, AbilityContext, AbilityOwner, AbilityRuntime } from './types'

/** 连锁型：电弧命中最近敌人后在敌群间弹跳传导，每跳伤害衰减——
 * 敌人越密越强。能力：bounces 提升；onHit 末跳落点命中效果（过载爆裂等） */
export class ChainArcAbility implements AbilityRuntime {
  private cooldown: number

  constructor(
    private def: ChainArcDef,
    private ctx: AbilityContext,
    initialCooldownMs: number,
  ) {
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: AbilityOwner): void {
    this.cooldown -= delta
    if (this.cooldown > 0) return
    const visited = new Set<unknown>()
    const first = nearestTarget(owner.x, owner.y, this.ctx.targets(), this.def.range, visited)
    if (!first) return
    this.cooldown = this.def.cooldownMs * this.ctx.cooldownMul()
    this.ctx.sfx('zap')

    // 逐跳传导：伤害递减，路径记折线
    const points: { x: number; y: number }[] = [{ x: owner.x, y: owner.y }]
    let damage = this.def.damage * this.ctx.damageMul()
    let cur: TargetInfo | null = first
    let last: TargetInfo = first
    for (let hop = 0; hop <= this.def.bounces && cur; hop++) {
      visited.add(cur.ref)
      points.push({ x: cur.x, y: cur.y })
      this.ctx.damageTarget(cur.ref, Math.max(1, Math.round(damage)), this.def.knockback, points[points.length - 2]!.x, points[points.length - 2]!.y)
      last = cur
      damage *= this.def.decay
      cur = nearestTarget(cur.x, cur.y, this.ctx.targets(), this.def.arcRange, visited)
    }

    if (this.def.onHit) {
      applyEffects(this.ctx, this.def.onHit, { center: { x: last.x, y: last.y }, baseDamage: damage, exclude: visited })
    }

    this.drawArc(points)
  }

  /** 锯齿闪电折线：每段拆几截并加垂直抖动，短暂淡出 */
  private drawArc(points: { x: number; y: number }[]): void {
    if (points.length < 2) return
    const g = this.ctx.scene.add.graphics().setDepth(14)
    g.lineStyle(3, this.def.color, 0.95)
    g.beginPath()
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!
      const b = points[i]!
      const segs = 4
      g.moveTo(a.x, a.y)
      for (let s = 1; s <= segs; s++) {
        const t = s / segs
        const nx = -(b.y - a.y)
        const ny = b.x - a.x
        const len = Math.hypot(nx, ny) || 1
        const jitter = s === segs ? 0 : (Math.random() - 0.5) * 18
        g.lineTo(a.x + (b.x - a.x) * t + (nx / len) * jitter, a.y + (b.y - a.y) * t + (ny / len) * jitter)
      }
    }
    g.strokePath()
    this.ctx.scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() })
  }

  setVisible(_on: boolean): void {
    void _on
  }

  destroy(): void {}
}
