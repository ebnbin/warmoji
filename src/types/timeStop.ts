export interface TimeStopTuning {
  /** 世界时间流速下限，不为 0 */
  readonly floor: number
  /** 时标低通平滑时间常数（ms） */
  readonly easeMs: number
  /** 冷雾最大不透明度 */
  readonly chillMaxAlpha: number
  readonly chillColor: number
  /** 冷雾淡入淡出时间常数（ms） */
  readonly fadeMs: number
}
