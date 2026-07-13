import { SPAWN } from './config'

export interface WaveState {
  spawnIntervalMs: number
  hpMultiplier: number
  ghostShare: number
}

export function waveAt(elapsedSec: number): WaveState {
  const t = Math.max(0, elapsedSec)
  const ramp = Math.min(1, t / SPAWN.rampSeconds)
  return {
    spawnIntervalMs: SPAWN.startIntervalMs - (SPAWN.startIntervalMs - SPAWN.minIntervalMs) * ramp,
    hpMultiplier: 1 + (t / 60) * SPAWN.hpGrowthPerMin,
    ghostShare: Math.min(
      SPAWN.ghostShareMax,
      SPAWN.ghostShareStart +
        (SPAWN.ghostShareMax - SPAWN.ghostShareStart) * (t / SPAWN.ghostShareRampSeconds),
    ),
  }
}
