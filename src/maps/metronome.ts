// 秒针地图（kind='metronome'）的纯参数与时标映射（禁 phaser/DOM）。
// 世界时间流速 = 队伍移动量：静止时降到 floor（近乎时停、只能读盘），
// 全速移动时为 1。移动即「花时间推进世界」——静则安全但停滞，动则输出但危险。

export const METRO = {
  /** 完全静止时的世界时间流速下限（不做成 0：永不卡死，且能看清弹幕读盘） */
  floor: 0.08,
  /** 移动量→时标的低通平滑时间常数（ms）：避免时标逐帧抖动 */
  easeMs: 130,
  /** 时停冷雾遮罩最大不透明度（越静越浓，读出「世界被你按住了」） */
  chillMaxAlpha: 0.42,
  /** 冷雾颜色（近黑冷调）：静止时压暗整屏 = 通用可读的「时停」信号，不与任何图底色撞色 */
  chillColor: 0x060a14,
} as const

/** 队伍移动量 input01∈[0,1] → 世界时间流速∈[floor,1]（越动越快，线性） */
export function timeScaleFor(input01: number): number {
  const t = input01 < 0 ? 0 : input01 > 1 ? 1 : input01
  return METRO.floor + (1 - METRO.floor) * t
}
