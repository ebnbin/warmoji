import { describe, expect, it } from 'vitest'
import { SPAWN, WAVE } from './config'
import { isFinalWave, waveAt, waveDurationMs } from './waves'

describe('waves', () => {
  it('开局为初始刷怪间隔、无强化', () => {
    const w = waveAt(0)
    expect(w.spawnIntervalMs).toBe(SPAWN.startIntervalMs)
    expect(w.hpMultiplier).toBe(1)
  })

  it('刷怪间隔随时间递减且不低于下限', () => {
    let prev = waveAt(0).spawnIntervalMs
    for (const t of [30, 60, 90, 120, 150, 600]) {
      const cur = waveAt(t).spawnIntervalMs
      expect(cur).toBeLessThanOrEqual(prev)
      expect(cur).toBeGreaterThanOrEqual(SPAWN.minIntervalMs)
      prev = cur
    }
    expect(waveAt(10_000).spawnIntervalMs).toBe(SPAWN.minIntervalMs)
  })

  it('敌人血量随时间增长', () => {
    expect(waveAt(60).hpMultiplier).toBeCloseTo(1 + SPAWN.hpGrowthPerMin)
    expect(waveAt(120).hpMultiplier).toBeGreaterThan(waveAt(60).hpMultiplier)
  })

  it('负数时间按 0 处理', () => {
    expect(waveAt(-10)).toEqual(waveAt(0))
  })

  it('波时长：前几波短波，之后标准波', () => {
    expect(waveDurationMs(1)).toBe(WAVE.shortMs)
    expect(waveDurationMs(WAVE.shortWaves)).toBe(WAVE.shortMs)
    expect(waveDurationMs(WAVE.shortWaves + 1)).toBe(WAVE.longMs)
    expect(waveDurationMs(WAVE.totalWaves)).toBe(WAVE.longMs)
  })

  it('通关判定：打完最后一波为真', () => {
    expect(isFinalWave(WAVE.totalWaves - 1)).toBe(false)
    expect(isFinalWave(WAVE.totalWaves)).toBe(true)
  })
})
