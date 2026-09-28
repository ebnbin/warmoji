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
  readonly xp: {
    readonly base: number
    readonly growth: number
    readonly waveBonusBase: number
    readonly waveBonusPerWave: number
  }
}
