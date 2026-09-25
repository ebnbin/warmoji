export interface FeelTuning {
  readonly follow: {
    readonly kBase: number
    readonly kJitter: number
    readonly zeta: number
    readonly maxLag: number
  }
  readonly pursuit: {
    readonly arriveRadius: number
    readonly slowRadius: number
    readonly easeFloor: number
    readonly leash: number
    readonly catchUpMul: number
    readonly snapDist: number
    readonly separation: number
  }
  readonly wander: {
    readonly radius: number
    readonly freqX: number
    readonly freqY: number
    readonly rampMs: number
  }
  readonly hitShake: { readonly durationMs: number; readonly intensity: number }
  readonly orbit: {
    readonly detectRange: number
    readonly maxSpeed: number
    readonly avoidGain: number
    readonly seekGain: number
  }
}
