import type { ChainArcDef } from '../../types/abilityDefs'
import { applyEffects } from './effects'
import { lightningCue } from '../cues'
import { nearestTarget } from './targeting'
import type { TargetInfo, AbilityContext, AbilityOwner, AbilityRuntime } from './types'

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
