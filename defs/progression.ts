import type { Progression } from '../src/run/waves'

// 关卡进程与经济（创作层·不进运行时 bundle）：波次时长表 / 精英波 / 无尽循环点 /
// 复活血比 / 结算横幅时长 / 金币掉落曲线。逻辑（波次映射、掉率函数）留在 src/run/waves.ts，
// 这里只放「设计数值」——经 npm run gen 校验后产出 src/assets/progression.json。
export const PROGRESSION = {
  // 每波战斗时长（秒），下标 = 波次 - 1；末波为 Boss 波（击败或撑满皆通关）
  waveDurationsSec: [20, 20, 25, 25, 30, 30, 40, 40, 40, 60, 50, 50, 50, 50, 70, 60, 60, 90],
  // 精英波：开局一波密集敌潮（参数见 SURGE）
  eliteWaves: [10, 15],
  // 无尽循环起点：第 loopFrom 波到末波构成循环段（无尽模式的结构基础）
  loopFrom: 7,
  // 阵亡者下波低血复活的血比
  reviveHpRatio: 0.3,
  // 波末结算横幅停留时长（ms）：给玩家松手时间，防误触商店按钮
  summaryMs: 1600,
  // 金币掉落概率下限（随难度从 1 平滑下探到此值）
  coinDropChanceMin: 0.35,
  // 金币掉落概率衰减半衰期（秒）
  coinDropChanceHalfLifeSec: 220,
  // 队伍经验：等比升级曲线（前快后慢，无上限）+ 波末保底。校准目标（15 波制）：
  // 第 1 波结束 2~3 级，无经验加成队长通关约 22~24 级；加波次/拉长时长不用动曲线。
  xp: { base: 80, growth: 1.15, waveBonusBase: 40, waveBonusPerWave: 36 },
  // 命定卡池：开局用队长种子一次抽 poolSize 张角色牌（整局固定），按已开放编制数查表解锁可选张数
  recruit: { poolSize: 10, unlocks: [4, 6, 8, 9, 10] },
} as const satisfies Progression
