import type { TimeStopDef } from '../../types/abilityDefs'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './types'
import { TIMESTOP } from '../../data/timeStop'

/** 时停型（队长主动技能载荷）：释放后 durationMs 内整个世界时间近乎凝固——
 * 敌人、双方弹体、双方攻速、刷怪、波次倒计时全冻结，唯玩家走位如常。逐帧凝固在
 * 场景 worldTimeScale 侧统一处理，本能力只负责按下开关。 */
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

/** 队伍移动量 input01∈[0,1] → 世界时间流速∈[floor,1]（越动越快，线性） */
export function timeScaleFor(input01: number): number {
  const t = input01 < 0 ? 0 : input01 > 1 ? 1 : input01
  return TIMESTOP.floor + (1 - TIMESTOP.floor) * t
}
