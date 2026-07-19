import type { RallyDef } from './defs'
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
    const ring = this.ctx.scene.add
      .circle(x, y, this.def.ringRadius, this.def.color, 0.3)
      .setStrokeStyle(4, this.def.color, 0.9)
      .setDepth(20)
      .setScale(0.4)
    this.ctx.scene.tweens.add({
      targets: ring,
      scale: 3,
      alpha: 0,
      duration: 550,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    })
  }

  setVisible(_on: boolean): void {
    void _on
  }

  destroy(): void {}
}
