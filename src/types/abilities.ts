import abilitiesJson from '../assets/abilities.json'

export interface CombatTuning {
  /** tauMs 冲量指数衰减时间常数（位移 ≈ 冲量 × tauMs/1000）；maxSpeed 合速度上限；deathSlideMs 尸体滑行时长 */
  readonly knockback: {
    readonly tauMs: number
    readonly maxSpeed: number
    readonly deathSlideMs: number
  }
  /** 索敌上限（格） */
  readonly acquire: { readonly range: number }
}
export type AbilityId = keyof typeof abilitiesJson
