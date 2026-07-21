import type { RallyDef } from './defs'
import { circleCue } from './cues'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

/** 集结型：阵亡我方满血复活、存活者按上限比例回复、全队短暂无敌，
 * 以我方锚点（队伍中心）爆出冲击环。团队操作经 ctx.rallyTeam 收口 */
export class RallyAbility implements AbilityRuntime {
  private cooldown: number

  constructor(
    private def: RallyDef,
    private ctx: AbilityContext,
    initialCooldownMs: number,
  ) {
    this.cooldown = initialCooldownMs
  }

  update(delta: number, owner: AbilityOwner): void {
    this.cooldown -= delta
    if (this.cooldown > 0) return
    this.cooldown = this.def.cooldownMs * this.ctx.cooldownMul()
    this.castNow(owner)
  }

  castNow(_owner: AbilityOwner): void {
    void _owner
    this.ctx.rallyTeam?.(this.def.healRatio, this.def.invulnMs)
    const { x, y } = this.ctx.anchor()
    circleCue(this.ctx.scene, x, y, this.def.ringRadius, {
      fill: this.def.color,
      fillAlpha: 0.3,
      stroke: this.def.color,
      lineWidth: 4,
      lineAlpha: 0.9,
      fromScale: 0.4,
      toScale: 3,
      durationMs: 550,
      depth: 20,
    })
  }

  setVisible(_on: boolean): void {
    void _on
  }

  destroy(): void {}
}
