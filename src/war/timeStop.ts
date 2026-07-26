import { TIMESTOP } from '../data/timeStop'

// 时停（队长「时停」技能）的纯参数与时标映射（禁 phaser/DOM）。
// 语义 = 把「秒针」机制窗口化：技能生效的 durationMs（世界时长）内，世界时间流速
// 随队伍移动量放缩——移动则恢复常速、静止则降到 floor（近乎凝固）；窗口本身也按
// 世界时长排空（时间变慢时这 15 秒也一起变慢）。窗口外恒常速，不影响任何地图。
// 参数表在 data/timeStop.ts（数据行在 defs/timestop.ts，经 gen 校验产出 json）；
// 本文件只留算法——war/ 不放表，见 eslint 的 assets/*.json 护栏。

/** 队伍移动量 input01∈[0,1] → 世界时间流速∈[floor,1]（越动越快，线性） */
export function timeScaleFor(input01: number): number {
  const t = input01 < 0 ? 0 : input01 > 1 ? 1 : input01
  return TIMESTOP.floor + (1 - TIMESTOP.floor) * t
}
