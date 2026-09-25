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

function cycleWave(wave: number): number {
  const last = WAVE.durationsSec.length
  if (wave <= last) return wave
  const span = last - WAVE.loopFrom + 1
  return WAVE.loopFrom + ((wave - WAVE.loopFrom) % span)
}

export function waveDurationMs(wave: number): number {
  return WAVE.durationsSec[cycleWave(wave) - 1]! * 1000
}

export function isEliteWave(wave: number): boolean {
  return WAVE.eliteWaves.includes(cycleWave(wave))
}

export function isBossWave(wave: number): boolean {
  return cycleWave(wave) === WAVE.durationsSec.length
}

export function isFinalWave(wave: number): boolean {
  return wave >= WAVE.totalWaves
}

export const XP = P.xp

export const RECRUIT = P.recruit

export const WAVE = {
  durationsSec: P.waveDurationsSec,
  eliteWaves: P.eliteWaves,
  loopFrom: P.loopFrom,
  totalWaves: P.waveDurationsSec.length,
  reviveHpRatio: P.reviveHpRatio,
  summaryMs: P.summaryMs,
} as const

const COIN_ECON = {
  dropChanceMin: P.coinDropChanceMin,
  dropChanceHalfLifeSec: P.coinDropChanceHalfLifeSec,
} as const

export function coinDropChance(combatSec: number): number {
  const t = Math.exp(-Math.max(0, combatSec) / COIN_ECON.dropChanceHalfLifeSec)
  return COIN_ECON.dropChanceMin + (1 - COIN_ECON.dropChanceMin) * t
}
