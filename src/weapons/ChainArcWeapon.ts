import { circleHitIndices } from './spec'
import type { ChainArcSpec } from './spec'
import type { TargetInfo, WeaponContext, WeaponOwner, WeaponRuntime } from './types'

/** 连锁型：电弧命中最近敌人后在敌群间弹跳传导，每跳伤害衰减——
 * 敌人越密越强。能力：bounces 提升；burstEnd 末跳落点小范围爆裂 */
export class ChainArcWeapon implements WeaponRuntime {
  private cooldown: number

  constructor(
    private spec: ChainArcSpec,
    private ctx: WeaponContext,
    initialCooldownMs: number,
  ) {
    this.cooldown = initialCooldownMs
  }

  private nearestWithin(x: number, y: number, range: number, exclude: Set<unknown>): TargetInfo | null {
    let best: TargetInfo | null = null
    let bestD = range * range
    for (const t of this.ctx.targets()) {
      if (exclude.has(t.ref)) continue
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
    this.cooldown -= delta
    if (this.cooldown > 0) return
    const visited = new Set<unknown>()
    const first = this.nearestWithin(owner.x, owner.y, this.spec.range, visited)
    if (!first) return
    this.cooldown = this.spec.cooldownMs * this.ctx.cooldownMul()
    this.ctx.sfx('zap')

    // 逐跳传导：伤害递减，路径记折线
    const points: { x: number; y: number }[] = [{ x: owner.x, y: owner.y }]
    let damage = this.spec.damage * this.ctx.damageMul()
    let cur: TargetInfo | null = first
    let last: TargetInfo = first
    for (let hop = 0; hop <= this.spec.bounces && cur; hop++) {
      visited.add(cur.ref)
      points.push({ x: cur.x, y: cur.y })
      this.ctx.damageTarget(cur.ref, Math.max(1, Math.round(damage)), this.spec.knockback, points[points.length - 2]!.x, points[points.length - 2]!.y)
      last = cur
      damage *= this.spec.decay
      cur = this.nearestWithin(cur.x, cur.y, this.spec.arcRange, visited)
    }

    const burst = this.spec.burstEnd
    if (burst) {
      const targets = this.ctx.targets()
      const burstDamage = Math.max(1, Math.round(damage * burst.ratio))
      for (const i of circleHitIndices({ x: last.x, y: last.y }, burst.radius, targets)) {
        const t = targets[i]!
        if (visited.has(t.ref)) continue
        this.ctx.damageTarget(t.ref, burstDamage, this.spec.knockback * 0.6, last.x, last.y)
      }
      const ring = this.ctx.scene.add
        .circle(last.x, last.y, burst.radius, this.spec.color, 0.25)
        .setStrokeStyle(3, this.spec.color, 0.9)
        .setDepth(7)
        .setScale(0.3)
      this.ctx.scene.tweens.add({
        targets: ring,
        scale: 1,
        alpha: 0,
        duration: 240,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy(),
      })
    }

    this.drawArc(points)
  }

  /** 锯齿闪电折线：每段拆几截并加垂直抖动，短暂淡出 */
  private drawArc(points: { x: number; y: number }[]): void {
    if (points.length < 2) return
    const g = this.ctx.scene.add.graphics().setDepth(14)
    g.lineStyle(3, this.spec.color, 0.95)
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
