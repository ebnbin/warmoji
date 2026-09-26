import type { Effect } from './abilityDefs'

/** 每次节拍先扣 damage 再施加 effects */
export interface GroundEffectDef {
  readonly radius: number
  readonly durationMs: number
  readonly tickMs: number
  readonly damage: number
  readonly color: number
  readonly fillAlpha: number
  readonly lineAlpha: number
  readonly enterMs: number
  readonly effects?: readonly Effect[]
}
