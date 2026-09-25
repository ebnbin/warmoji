import type { BATTLEFIELD } from '../../defs/battlefield'
import type { MapId } from './maps'

export type Polarity = 'buff' | 'debuff'
export interface BattleEffects {
  moveSpeedMul: number
  teamDamageMul: number
  teamCooldownMul: number
  critAdd: number
  enemySlowMul: number
}
interface FieldPickupOf<Id> {
  readonly id: Id
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly polarity: Polarity
  readonly durationMs: number
  readonly fx: Partial<BattleEffects>
}
export type FieldPickupSource = FieldPickupOf<string>
export type FieldPickupId = (typeof BATTLEFIELD)['pools'][MapId][number]['id']
export type FieldPickupDef = FieldPickupOf<FieldPickupId>
export interface BattlefieldTuning {
  readonly pools: Record<MapId, readonly FieldPickupSource[]>
  readonly field: {
    readonly grabRadiusU: number
    readonly groundMs: number
    readonly auraRadiusU: number
  }
  readonly carrierBudget: {
    readonly boss: { readonly buff: number; readonly debuff: number }
    readonly waveTiers: readonly {
      readonly upToWave: number
      readonly buff: number
      readonly debuff: number
    }[]
    readonly fallback: { readonly buff: number; readonly debuff: number }
  }
}
