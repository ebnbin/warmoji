import type { ChainArcDef } from '../../data/abilityDefs'
import { applyEffects } from './effects'
import { lightningCue } from '../../war/cues'
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

    lightningCue(this.ctx.scene, points, this.def.color)
  }

  setVisible(_on: boolean): void {
    void _on
  }

  destroy(): void {}
}
