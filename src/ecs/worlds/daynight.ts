import type { DayNightConfig } from '../../types/maps'

export function hourAt(combatSec: number, cfg: DayNightConfig): number {
  const h = cfg.startHour + combatSec * (24 / cfg.cycleSec)
  return ((h % 24) + 24) % 24
}

export function visionGridsAt(hour: number, cfg: DayNightConfig): number {
  const c = Math.cos(((hour - 12) * Math.PI) / 12)
  return cfg.visionMid + (c >= 0 ? cfg.visionMax - cfg.visionMid : cfg.visionMid - cfg.visionMin) * c
}

function nightDepthAt(hour: number): number {
  const fromMidnight = Math.min(hour, 24 - hour)
  return Math.max(0, 1 - fromMidnight / 6)
}

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
