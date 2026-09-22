import type { TimeStopDef } from '../../types/abilityDefs'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'
import { TIMESTOP } from '../../data/timeStop'

/** 逐帧凝固在场景 worldTimeScale 侧处理，本能力只按下开关 */
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

/** 移动量 [0,1] → 流速 [floor,1]，线性 */
export function timeScaleFor(input01: number): number {
  const t = input01 < 0 ? 0 : input01 > 1 ? 1 : input01
  return TIMESTOP.floor + (1 - TIMESTOP.floor) * t
}
