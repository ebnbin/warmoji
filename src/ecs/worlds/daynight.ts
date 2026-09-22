// 主时钟 = 累计战斗秒，跨波持久、非战斗不走
import type { DayNightConfig } from '../../types/maps'

/** 时刻 0..24，按周期回卷 */
export function hourAt(combatSec: number, cfg: DayNightConfig): number {
  const h = cfg.startHour + combatSec * (24 / cfg.cycleSec)
  return ((h % 24) + 24) % 24
}

export function visionGridsAt(hour: number, cfg: DayNightConfig): number {
  return cfg.visionMid + (cfg.visionMax - cfg.visionMid) * Math.cos(((hour - 12) * Math.PI) / 12)
}

/** 0..1：白天与黄昏 0，午夜 1 */
function nightDepthAt(hour: number): number {
  const fromMidnight = Math.min(hour, 24 - hour) // 0..12
  return Math.max(0, 1 - fromMidnight / 6)
}

/** 06:00–18:00 */
export function isDayAt(hour: number): boolean {
  return hour >= 6 && hour < 18
}

export function fogRadiusAt(hour: number, cfg: DayNightConfig): number {
  const d = nightDepthAt(hour)
  return cfg.fogRadiusDusk + (cfg.fogRadiusMidnight - cfg.fogRadiusDusk) * d
}

export function fogAlphaAt(hour: number, cfg: DayNightConfig): number {
  return cfg.fogAlphaMax * nightDepthAt(hour)
}
