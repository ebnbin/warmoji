import type { DanceDef } from '../../types/abilityDefs'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'

/** 群舞型：敌对方全体跳舞定身（含 Boss 与休眠者；蓄力/冲刺被打断，
 * 窗口内新登场的也要跳）。逐帧表现在敌方转向的舞蹈分支 */
export class DanceAbility implements AbilityRuntime {
  private cooldown: number

  constructor(
    private def: DanceDef,
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
    this.ctx.danceTargets?.(this.def.durationMs)
  }

  setVisible(_on: boolean): void {
    void _on
  }

  destroy(): void {}
}
