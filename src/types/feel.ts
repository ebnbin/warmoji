export interface FeelTuning {
  readonly squad: {
    readonly fanDistance: number
    readonly fanSpreadDeg: number
    readonly seatRadius: number
    readonly claimRadius: number
    readonly seatHysteresis: number
    readonly reverseGain: number
    readonly turnRateDeg: number
    readonly recallDist: number
    readonly handoverMs: number
    readonly facingTauMs: number
  }
  readonly hitShake: { readonly durationMs: number; readonly intensity: number }
  readonly pop: { readonly enemyMs: number; readonly bossMs: number }
  readonly down: { readonly fallMs: number; readonly tilt: number; readonly holdMs: number; readonly fadeMs: number }
  readonly rejoin: {
    readonly dropMs: number
    readonly height: number
    readonly fadeInMs: number
    readonly bounceMs: number
    readonly squash: number
    readonly ringRadius: number
  }
  readonly emplace: { readonly popMs: number; readonly retireMs: number }
}
