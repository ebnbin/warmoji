import type { XpCurve } from './xp'

export interface WaveState {
  spawnIntervalMs: number
  hpMultiplier: number
}
export interface Progression {
  readonly reviveHpRatio: number
  readonly restRatio: number
  readonly summaryMs: number
  readonly coinDropChanceMin: number
  readonly coinDropChanceHalfLifeSec: number
  /** 不靠全队升级的一局的全队经验 */
  readonly xp: XpCurve
}
