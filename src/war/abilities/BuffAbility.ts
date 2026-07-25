import type { BuffDef } from '../../abilities/defs'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

/** 增益型：限时全队伤害倍率（经 stats.damageMul 流入所有能力伤害链，
 * 到期由战斗时钟自动复原） */
export class BuffAbility implements AbilityRuntime {
  private cooldown: number

  constructor(
    private def: BuffDef,
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
    this.ctx.buffTeamDamage?.(this.def.damageMul, this.def.durationMs)
  }

  setVisible(_on: boolean): void {
    void _on
  }

  destroy(): void {}
}
