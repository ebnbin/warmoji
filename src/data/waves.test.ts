import { describe, expect, it } from 'vitest'
import { SPAWN } from './enemies'
import { WAVE } from './waves'
import { cycleWave, isBossWave, isEliteWave, isFinalWave, waveAt, waveDurationMs } from './waves'
import { COIN_ECON, coinDropChance } from './waves'

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

  it('波时长逐波查表：表长 = 总波数，配置为正秒数', () => {
    expect(WAVE.durationsSec.length).toBe(WAVE.totalWaves)
    expect(WAVE.loopFrom).toBeGreaterThanOrEqual(1)
    expect(WAVE.loopFrom).toBeLessThanOrEqual(WAVE.totalWaves)
    for (let w = 1; w <= WAVE.totalWaves; w++) {
      expect(WAVE.durationsSec[w - 1]).toBeGreaterThan(0)
      expect(waveDurationMs(w)).toBe(WAVE.durationsSec[w - 1]! * 1000)
    }
  })

  it('无尽循环映射：表内波次原样，超表回到 [loopFrom..末波] 循环', () => {
    const last = WAVE.durationsSec.length
    const span = last - WAVE.loopFrom + 1
    for (let w = 1; w <= last; w++) expect(cycleWave(w)).toBe(w)
    expect(cycleWave(last + 1)).toBe(WAVE.loopFrom)
    expect(cycleWave(last + span)).toBe(last)
    expect(cycleWave(last + span + 1)).toBe(WAVE.loopFrom)
    // 循环圈内时长跟着映射走
    expect(waveDurationMs(last + 1)).toBe(waveDurationMs(WAVE.loopFrom))
    expect(waveDurationMs(last + span)).toBe(waveDurationMs(last))
  })

  it('精英波与 Boss 波判定（含循环圈）', () => {
    const last = WAVE.durationsSec.length
    const span = last - WAVE.loopFrom + 1
    expect(isEliteWave(1)).toBe(false)
    for (const w of WAVE.eliteWaves) {
      expect(isEliteWave(w)).toBe(true)
      if (w >= WAVE.loopFrom) expect(isEliteWave(w + span)).toBe(true)
    }
    expect(isBossWave(last)).toBe(true)
    expect(isBossWave(last - 1)).toBe(false)
    expect(isBossWave(last + span)).toBe(true)
  })

  it('通关判定：打完最后一波为真', () => {
    expect(isFinalWave(WAVE.totalWaves - 1)).toBe(false)
    expect(isFinalWave(WAVE.totalWaves)).toBe(true)
  })

  it('金币压平：每杀掉钱概率从 1 单调下探到 dropChanceMin（压后期滚雪球）', () => {
    expect(coinDropChance(0)).toBeCloseTo(1)
    expect(coinDropChance(120)).toBeLessThan(coinDropChance(0))
    expect(coinDropChance(600)).toBeLessThan(coinDropChance(120))
    expect(coinDropChance(100000)).toBeGreaterThanOrEqual(COIN_ECON.dropChanceMin)
    expect(coinDropChance(100000)).toBeCloseTo(COIN_ECON.dropChanceMin, 1)
  })
})
