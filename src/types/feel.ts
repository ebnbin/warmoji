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
    /** 队长穿过传送门以后，镜头从门这头滑到门那头要多久，毫秒 */
    readonly portalCamMs: number
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
  /** 从出怪口进场的动作：腾空多高（格）、多久；走出与翻进的落点离口子 distU 格，翻进从边外 outU 格起跳；抛入的时长与高度按飞多远算 */
  readonly entrance: {
    readonly walk: { readonly ms: number; readonly heightU: number; readonly distU: readonly [number, number] }
    readonly climb: { readonly ms: number; readonly heightU: number; readonly distU: readonly [number, number]; readonly outU: number }
    readonly drop: { readonly ms: number; readonly heightU: number }
    readonly lob: { readonly minMs: number; readonly msPerU: number; readonly heightPerU: number }
  }
}
