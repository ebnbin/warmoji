// 难度曲线随跨波累计战斗时长走；出什么怪由 core/enemies.ts 的按波配比决定
export interface WaveState {
  spawnIntervalMs: number
  hpMultiplier: number
}
// 关卡进程与经济的「设计数值」形状：数据行在 defs/progression.ts（创作层），
// npm run gen 校验后产出 progression.json；本文件只留纯逻辑（波次映射、掉率函数）。
export interface Progression {
  /** 每波战斗时长（秒），下标 = 波次 - 1；末波为 Boss 波（击败或撑满皆通关） */
  readonly waveDurationsSec: readonly number[]
  /** 精英波：开局一波密集敌潮（参数见 SURGE） */
  readonly eliteWaves: readonly number[]
  /** 无尽循环起点：第 loopFrom 波到末波构成循环段 */
  readonly loopFrom: number
  /** 阵亡者下波低血复活的血比 */
  readonly reviveHpRatio: number
  /** 波末结算横幅停留时长（ms） */
  readonly summaryMs: number
  /** 金币掉落概率下限（随难度从 1 平滑下探到此值） */
  readonly coinDropChanceMin: number
  /** 金币掉落概率衰减半衰期（秒） */
  readonly coinDropChanceHalfLifeSec: number
  /** 队伍经验：前快后慢的等比升级曲线 + 波末保底 */
  readonly xp: {
    /** 1 级门槛（后续 ×growth^(level-1)） */
    readonly base: number
    /** 等比公比（>1 前快后慢） */
    readonly growth: number
    /** 波末保底经验 = base + perWave×波次 */
    readonly waveBonusBase: number
    readonly waveBonusPerWave: number
  }
  /** 命定卡池招募：开局按队长种子抽 poolSize 张，按开放编制数解锁可选张数 */
  readonly recruit: {
    readonly poolSize: number
    /** 下标 = 开放编制数 - 1；越界取末位 */
    readonly unlocks: readonly number[]
  }
}
