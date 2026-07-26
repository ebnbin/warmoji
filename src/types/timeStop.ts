export interface TimeStopTuning {
  /** 完全静止时的世界时间流速下限（近乎凝固，不做成 0：留一丝蠕动感、且避免边界特例） */
  readonly floor: number
  /** 移动量→时标的低通平滑时间常数（ms）：避免时标逐帧抖动 */
  readonly easeMs: number
  /** 冷雾遮罩最大不透明度（越静越浓，读出「时停」） */
  readonly chillMaxAlpha: number
  /** 冷雾颜色（近黑冷调，压暗整屏 = 通用可读的信号，不与任何图底色撞色） */
  readonly chillColor: number
  /** 冷雾淡入淡出时间常数（ms） */
  readonly fadeMs: number
}
