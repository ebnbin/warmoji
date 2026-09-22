export interface WaveState {
  spawnIntervalMs: number
  hpMultiplier: number
}
export interface Progression {
  /** 秒；下标 = 波次 - 1；末波为 Boss 波 */
  readonly waveDurationsSec: readonly number[]
  readonly eliteWaves: readonly number[]
  /** 无尽模式循环段 = [loopFrom, 末波] */
  readonly loopFrom: number
  readonly reviveHpRatio: number
  readonly summaryMs: number
  /** 随难度从 1 下探到此值 */
  readonly coinDropChanceMin: number
  readonly coinDropChanceHalfLifeSec: number
  readonly xp: {
    /** 1 级门槛；第 n 级 = base × growth^(n-1) */
    readonly base: number
    readonly growth: number
    /** 波末保底 = waveBonusBase + waveBonusPerWave × 波次 */
    readonly waveBonusBase: number
    readonly waveBonusPerWave: number
  }
  /** 开局按队长种子抽 poolSize 张 */
  readonly recruit: {
    readonly poolSize: number
    /** 下标 = 开放编制数 - 1；越界取末位 */
    readonly unlocks: readonly number[]
  }
}
