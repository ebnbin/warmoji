import progressionJson from '../assets/progression.json'
import { fromJson } from './json'
import type { DifficultyCurve, Progression, WaveState } from '../types/waves'

const P = fromJson<Progression>(progressionJson)

export function waveAt(curve: DifficultyCurve, elapsedSec: number): WaveState {
  const t = Math.max(0, elapsedSec)
  const ramp = Math.min(1, t / curve.rampSeconds)
  return {
    spawnIntervalMs: curve.startIntervalMs - (curve.startIntervalMs - curve.minIntervalMs) * ramp,
    hpMultiplier: 1 + (t / 60) * curve.hpGrowthPerMin,
  }
}

export const XP = P.xp

export const WAVE = {
  reviveHpRatio: P.reviveHpRatio,
  restRatio: P.restRatio,
  summaryMs: P.summaryMs,
} as const

export function coinDropChance(curve: DifficultyCurve, combatSec: number): number {
  const t = Math.exp(-Math.max(0, combatSec) / curve.coinDropChanceHalfLifeSec)
  return curve.coinDropChanceMin + (1 - curve.coinDropChanceMin) * t
}
