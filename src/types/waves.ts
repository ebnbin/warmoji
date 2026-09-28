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
  /** 全队经验：从 n 级升到下一级要 base × growth^(n-1)，到 maxLevel 就满级 */
  readonly xp: {
    readonly base: number
    readonly growth: number
    readonly maxLevel: number
  }
}
