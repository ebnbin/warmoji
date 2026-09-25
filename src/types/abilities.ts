import type abilitiesJson from '../assets/abilities.json'

export interface CombatTuning {
  readonly knockback: {
    readonly tauMs: number
    readonly maxSpeed: number
    readonly deathSlideMs: number
  }
  readonly acquire: { readonly range: number }
}
export type AbilityId = keyof typeof abilitiesJson
