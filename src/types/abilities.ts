import type abilitiesJson from '../assets/abilities.json'

interface BodyTuning {
  readonly mass: number
  readonly drag: number
  readonly grip: number
}
export interface CombatTuning {
  readonly enemyBody: BodyTuning
  readonly minionBody: BodyTuning
  readonly pickupBody: BodyTuning
  readonly shardBody: BodyTuning
  readonly knockback: {
    readonly maxSpeed: number
    readonly deathSlideMs: number
  }
  readonly acquire: { readonly range: number }
  readonly morph: { readonly recastMs: number; readonly recoverMs: number }
  readonly blinkIframePadMs: number
  readonly minionFirstShotMs: number
}
export type AbilityId = keyof typeof abilitiesJson
