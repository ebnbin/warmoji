import timestopJson from '../assets/timestop.json'
import type { TimeStopTuning } from '../types/timeStop'

// 时停（队长「时停」技能）的参数表。数据行在 defs/timestop.ts（创作层），
// npm run gen 校验并产出 timestop.json。时标映射算法在两套战斗实现各自包内（ecs/sim、arcade/abilities/TimeStopAbility）。
export const TIMESTOP = timestopJson as unknown as TimeStopTuning
