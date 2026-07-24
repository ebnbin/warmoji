import type { TimeStopTuning } from '../src/battle/timeStop'

// 时停技能参数（创作层）：世界时间流速下限、时标平滑、冷雾遮罩表现。
// 时标映射逻辑在 src/battle/timeStop.ts，这里只放设计数值——经 gen 校验产出 timestop.json。
export const TIMESTOP = {
  floor: 0.05,
  easeMs: 130,
  chillMaxAlpha: 0.5,
  chillColor: 0x040814,
  fadeMs: 140,
} as const satisfies TimeStopTuning
