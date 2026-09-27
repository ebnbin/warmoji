import type { StaminaTuning } from '../src/types/stamina'

export const STAMINA = {
  // 剩下的体力占上限的比例低于 slowFrom 开始减速，见底时速度只剩 floor
  slowFrom: 0.4,
  floor: 0.5,
  // 体力条低于 warnAt 变红，提示快见底了
  warnAt: 0.15,
  // 歇满 restDelayMs 才开始回，回复速度在 rampMs 内从 0 爬到满，停得越久回得越快
  restDelayMs: 500,
  rampMs: 2000,
  // 队员跟在队长身后赶路，只扣队长那份的这个比例
  draft: 0.6,
} as const satisfies StaminaTuning
