export interface FeelTuning {
  readonly follow: {
    /** 弹簧刚度（1/s²） */
    readonly kBase: number
    /** 按槽位抖动刚度的比例 */
    readonly kJitter: number
    /** 阻尼比 */
    readonly zeta: number
    /** 拖拽距离上限（px） */
    readonly maxLag: number
  }
  readonly wander: {
    readonly radius: number
    readonly freqX: number
    readonly freqY: number
    /** 幅度淡入淡出时长 */
    readonly rampMs: number
  }
  readonly hitShake: { readonly durationMs: number; readonly intensity: number }
  readonly orbit: {
    /** 格，从角色自身量起 */
    readonly detectRange: number
    /** 沿环最大角速度（rad/s） */
    readonly maxSpeed: number
    readonly avoidGain: number
    readonly seekGain: number
  }
}
