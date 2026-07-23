import type { TimeStopDef } from './defs'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

/** 时停型（队长主动技能载荷）：释放后 durationMs 内敌方时间近乎凝固——
 * 敌人移动/攻速/在途敌弹/刷怪全放慢，队伍走位与开火照常。逐帧凝固在
 * 场景 enemyTimeScale 侧统一处理，本能力只负责按下开关。 */
export class TimeStopAbility implements AbilityRuntime {
  private cooldown: number

  constructor(
    private def: TimeStopDef,
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
    this.ctx.timeStop?.(this.def.durationMs)
  }

  setVisible(_on: boolean): void {
    void _on
  }

  destroy(): void {}
}
