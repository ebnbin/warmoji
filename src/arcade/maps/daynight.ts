// 昼夜世界规则（kind='daynight'）的纯函数：跨波次主时钟 → 时刻 → 视野/迷雾。
// 主时钟 = 累计战斗秒（ArcadeBattleScene 的 combatMs + elapsed，跨波持久、非战斗不走）。
// 视野随时刻余弦涨落，夜里额外收一层以队伍为心的迷雾圈。设计参数在 MapDef.dayNight（数据）。
import type { DayNightConfig } from '../../types/maps'

/** 累计战斗秒 → 游戏时刻（0..24），跨波持久、按周期回卷 */
export function hourAt(combatSec: number, cfg: DayNightConfig): number {
  const h = cfg.startHour + combatSec * (24 / cfg.cycleSec)
  return ((h % 24) + 24) % 24
}

/** 时刻 → 视野格数：正午 max、黄昏/黎明 mid、午夜 min，余弦平滑（连续变大→变小→变大） */
export function visionGridsAt(hour: number, cfg: DayNightConfig): number {
  return cfg.visionMid + (cfg.visionMax - cfg.visionMid) * Math.cos(((hour - 12) * Math.PI) / 12)
}

/** 夜深程度 0..1：白天恒 0，黄昏/黎明 0，午夜 1（迷雾半径/浓度都挂它） */
function nightDepthAt(hour: number): number {
  const fromMidnight = Math.min(hour, 24 - hour) // 距午夜的小时数 0..12
  return Math.max(0, 1 - fromMidnight / 6)
}

/** 是否白天（06:00–18:00）：昼夜两批怪、出怪密度据此切换 */
export function isDayAt(hour: number): boolean {
  return hour >= 6 && hour < 18
}

/** 夜雾圈半径（格）：白天等于 dusk 极大值（视觉上不挡），夜里按夜深收到午夜值 */
export function fogRadiusAt(hour: number, cfg: DayNightConfig): number {
  const d = nightDepthAt(hour)
  return cfg.fogRadiusDusk + (cfg.fogRadiusMidnight - cfg.fogRadiusDusk) * d
}

/** 夜雾不透明度：白天 0，夜里按夜深淡入到 fogAlphaMax */
export function fogAlphaAt(hour: number, cfg: DayNightConfig): number {
  return cfg.fogAlphaMax * nightDepthAt(hour)
}
