import type { MapId } from './maps'
import type { StatMods } from './stats'

export type Polarity = 'buff' | 'debuff'
/** 战场效果：对我方所有身体与敌方所有身体各自的属性修正 */
export interface BattleEffects {
  readonly team: readonly StatMods[]
  readonly enemy: readonly StatMods[]
}
export interface FieldPickupDef {
  readonly id: string
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly polarity: Polarity
  readonly durationMs: number
  readonly fx: { readonly team?: StatMods; readonly enemy?: StatMods }
}
export interface BattlefieldTuning {
  readonly pools: Record<MapId, readonly FieldPickupDef[]>
  readonly field: {
    readonly grabRadiusU: number
    readonly groundMs: number
    readonly auraRadiusU: number
  }
}
