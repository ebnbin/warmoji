import type abilitiesJson from '../assets/abilities.json'

export interface CombatTuning {
  readonly enemyBody: { readonly mass: number; readonly drag: number; readonly grip: number }
  readonly knockback: {
    readonly maxSpeed: number
    readonly deathSlideMs: number
  }
  readonly acquire: { readonly range: number }
}
export type AbilityId = keyof typeof abilitiesJson
