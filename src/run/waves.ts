import { SPAWN, WAVE } from '../config'

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
