export interface FeelTuning {
  readonly squad: {
    readonly fanDistance: number
    readonly fanSpreadDeg: number
    readonly seatRadius: number
    readonly claimRadius: number
    readonly seatHysteresis: number
    readonly ghostSpeed: number
    readonly reverseGain: number
    readonly turnRateDeg: number
    readonly recallDist: number
    readonly handoverMs: number
    readonly facingTauMs: number
  }
  readonly hitShake: { readonly durationMs: number; readonly intensity: number }
  readonly pop: { readonly reviveMs: number; readonly enemyMs: number; readonly bossMs: number }
  readonly emplace: { readonly popMs: number; readonly retireMs: number }
}
