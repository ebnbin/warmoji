export interface WaveState {
  spawnIntervalMs: number
  hpMultiplier: number
}
export interface Progression {
  readonly waveDurationsSec: readonly number[]
  readonly eliteWaves: readonly number[]
  readonly loopFrom: number
  readonly reviveHpRatio: number
  readonly summaryMs: number
  readonly coinDropChanceMin: number
  readonly coinDropChanceHalfLifeSec: number
  readonly xp: {
    readonly base: number
    readonly growth: number
    readonly waveBonusBase: number
    readonly waveBonusPerWave: number
  }
  readonly recruit: {
    readonly poolSize: number
    readonly unlocks: readonly number[]
  }
}
