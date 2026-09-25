import type { ABILITIES } from '../../defs/abilities'

export interface CombatTuning {
  readonly knockback: {
    readonly tauMs: number
    readonly maxSpeed: number
    readonly deathSlideMs: number
  }
  readonly acquire: { readonly range: number }
}
export type AbilityId = keyof typeof ABILITIES
