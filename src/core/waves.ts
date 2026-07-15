import { SPAWN, WAVE } from './config'

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

/** 本波战斗时长：前几波短波快节奏，之后标准波 */
export function waveDurationMs(wave: number): number {
  return wave <= WAVE.shortWaves ? WAVE.shortMs : WAVE.longMs
}

/** 打完这一波是否通关 */
export function isFinalWave(wave: number): boolean {
  return wave >= WAVE.totalWaves
}
