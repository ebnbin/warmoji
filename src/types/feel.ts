export interface FeelTuning {
  readonly follow: {
    readonly kBase: number
    readonly kJitter: number
    readonly zeta: number
    readonly maxLag: number
  }
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
}
