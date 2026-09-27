import { SPAWN } from './enemies'
import progressionJson from '../assets/progression.json'
import { fromJson } from './json'
import type { Progression, WaveState } from '../types/waves'

const P = fromJson<Progression>(progressionJson)

export function waveAt(elapsedSec: number): WaveState {
  const t = Math.max(0, elapsedSec)
  const ramp = Math.min(1, t / SPAWN.rampSeconds)
  return {
    spawnIntervalMs: SPAWN.startIntervalMs - (SPAWN.startIntervalMs - SPAWN.minIntervalMs) * ramp,
    hpMultiplier: 1 + (t / 60) * SPAWN.hpGrowthPerMin,
  }
}

export const XP = P.xp

export const WAVE = {
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
