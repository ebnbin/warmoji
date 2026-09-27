import type { StaminaTuning } from '../src/types/stamina'

export const STAMINA = {
  // 体力是 0 到 1 的比例；低于 slowFrom 开始减速，见底时速度只剩 floor
  slowFrom: 0.4,
  floor: 0.5,
  // 歇满 restDelayMs 才开始回，回复速度在 rampMs 内从 0 爬到每秒 regen，停得越久回得越快
  restDelayMs: 500,
  rampMs: 2000,
  regen: 0.6,
} as const satisfies StaminaTuning
