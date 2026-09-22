import type { BuffDef } from '../../types/abilityDefs'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

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
