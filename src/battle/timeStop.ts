import timestopJson from '../assets/timestop.json'

// 时停（队长「时停」技能）的纯参数与时标映射（禁 phaser/DOM）。
// 语义 = 把「秒针」机制窗口化：技能生效的 durationMs（世界时长）内，世界时间流速
// 随队伍移动量放缩——移动则恢复常速、静止则降到 floor（近乎凝固）；窗口本身也按
// 世界时长排空（时间变慢时这 15 秒也一起变慢）。窗口外恒常速，不影响任何地图。
// 参数在 defs/timestop.ts（创作层），经 gen 校验产出 timestop.json。

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

export const TIMESTOP = timestopJson as unknown as TimeStopTuning

/** 队伍移动量 input01∈[0,1] → 世界时间流速∈[floor,1]（越动越快，线性） */
export function timeScaleFor(input01: number): number {
  const t = input01 < 0 ? 0 : input01 > 1 ? 1 : input01
  return TIMESTOP.floor + (1 - TIMESTOP.floor) * t
}
