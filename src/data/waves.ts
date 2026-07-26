import { SPAWN } from './enemies'
import progressionJson from '../assets/progression.json'
import type { Progression, WaveState } from '../types/waves'

const P = progressionJson as unknown as Progression

export function waveAt(elapsedSec: number): WaveState {
  const t = Math.max(0, elapsedSec)
  const ramp = Math.min(1, t / SPAWN.rampSeconds)
  return {
    spawnIntervalMs: SPAWN.startIntervalMs - (SPAWN.startIntervalMs - SPAWN.minIntervalMs) * ramp,
    hpMultiplier: 1 + (t / 60) * SPAWN.hpGrowthPerMin,
  }
}

/** 波次 → 时长表下标波次：超出表的波次映射回 [loopFrom..末波] 循环（无尽模式的结构基础） */
function cycleWave(wave: number): number {
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
// 结构判定都在本文件；进程/经济的设计数值在 defs/progression.ts（经 gen 校验）。
/** 队伍经验曲线参数；升级/结算算法在 war/xp.ts */
export const XP = P.xp

export const WAVE = {
  /** 每波战斗时长（秒），下标 = 波次 - 1；末波为 Boss 波（击败或撑满皆通关） */
  durationsSec: P.waveDurationsSec,
  /** 精英波：开局一波密集敌潮（参数见 SURGE） */
  eliteWaves: P.eliteWaves,
  /** 无尽循环起点：第 loopFrom 波到末波构成循环段 */
  loopFrom: P.loopFrom,
  totalWaves: P.waveDurationsSec.length,
  reviveHpRatio: P.reviveHpRatio,
  /** 波末结算横幅停留时长：给玩家松手时间，防止战斗输入误触商店按钮 */
  summaryMs: P.summaryMs,
} as const

// 金币经济压平：前期 DPS/怪少 → 穷；后期 DPS/怪多 → 每局大几千，曲线两头失衡。
// 双管：① 金币掉落「概率」随难度（累计战斗时长）递减——前期几乎必掉、后期只有一部分
// 击杀掉钱，压后期滚雪球；② 前期道具降价（见 items/registry.ts itemPrice）。设计值见 defs/progression.ts。
export const COIN_ECON = {
  /** 每杀掉金币的概率随难度从 1 平滑下探到 dropChanceMin；halfLifeSec 控制衰减速度 */
  dropChanceMin: P.coinDropChanceMin,
  dropChanceHalfLifeSec: P.coinDropChanceHalfLifeSec,
} as const

/** 每杀掉金币的概率（1 → dropChanceMin，按累计战斗时长指数衰减） */
export function coinDropChance(combatSec: number): number {
  const t = Math.exp(-Math.max(0, combatSec) / COIN_ECON.dropChanceHalfLifeSec)
  return COIN_ECON.dropChanceMin + (1 - COIN_ECON.dropChanceMin) * t
}
