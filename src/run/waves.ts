import { SPAWN } from '../enemies/registry'

// 难度曲线随跨波累计战斗时长走；出什么怪由 core/enemies.ts 的按波配比决定
export interface WaveState {
  spawnIntervalMs: number
  hpMultiplier: number
}

export function waveAt(elapsedSec: number): WaveState {
  const t = Math.max(0, elapsedSec)
  const ramp = Math.min(1, t / SPAWN.rampSeconds)
  return {
    spawnIntervalMs: SPAWN.startIntervalMs - (SPAWN.startIntervalMs - SPAWN.minIntervalMs) * ramp,
    hpMultiplier: 1 + (t / 60) * SPAWN.hpGrowthPerMin,
  }
}

/** 波次 → 时长表下标波次：超出表的波次映射回 [loopFrom..末波] 循环（无尽模式的结构基础） */
export function cycleWave(wave: number): number {
  const last = WAVE.durationsSec.length
  if (wave <= last) return wave
  const span = last - WAVE.loopFrom + 1
  return WAVE.loopFrom + ((wave - WAVE.loopFrom) % span)
}

/** 本波战斗时长：逐波配置表（WAVE.durationsSec） */
export function waveDurationMs(wave: number): number {
  return WAVE.durationsSec[cycleWave(wave) - 1]! * 1000
}

/** 精英波：开局一波密集敌潮（参数见 SURGE） */
export function isEliteWave(wave: number): boolean {
  return WAVE.eliteWaves.includes(cycleWave(wave))
}

/** Boss 波：时长表末波（无尽循环里每圈打一次 Boss） */
export function isBossWave(wave: number): boolean {
  return cycleWave(wave) === WAVE.durationsSec.length
}

/** 打完这一波是否通关（有限局胜利判定） */
export function isFinalWave(wave: number): boolean {
  return wave >= WAVE.totalWaves
}

// 波次制：一波战斗固定时长 → 结算横幅 → 整编/商店 → 下一波；上一波阵亡者下波低血复活。
// 有限局：打满 totalWaves 波即通关（进结算页），中途团灭进同一结算页的失败版。
// 结构判定都在 本文件：精英波开局敌潮（SURGE）、末波 Boss 战；
// 超出表的波次映射回 [loopFrom..末波] 循环（无尽模式的结构基础）
const WAVE_DURATIONS_SEC: readonly number[] = [
  20, 20, 25, 25, 30, 30, 40, 40, 40, 60, 50, 50, 50, 50, 70, 60, 60, 90,
]

export const WAVE = {
  /** 每波战斗时长（秒），下标 = 波次 - 1；末波为 Boss 波（击败或撑满皆通关） */
  durationsSec: WAVE_DURATIONS_SEC,
  /** 精英波：开局一波密集敌潮（参数见 SURGE） */
  eliteWaves: [10, 15] as readonly number[],
  /** 无尽循环起点：第 loopFrom 波到末波构成循环段 */
  loopFrom: 7,
  totalWaves: WAVE_DURATIONS_SEC.length,
  reviveHpRatio: 0.3,
  /** 波末结算横幅停留时长：给玩家松手时间，防止战斗输入误触商店按钮 */
  summaryMs: 1600,
} as const
