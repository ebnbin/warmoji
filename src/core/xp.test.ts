import { describe, expect, it } from 'vitest'
import { XP } from './config'
import { gainXp, waveBonusXp, xpToNext } from './xp'

describe('xp', () => {
  it('等比曲线：门槛严格递增，前快后慢', () => {
    expect(xpToNext(1)).toBe(XP.base)
    for (let level = 1; level < 25; level++) {
      expect(xpToNext(level)).toBeGreaterThan(0)
      expect(xpToNext(level + 1)).toBeGreaterThan(xpToNext(level))
    }
    // 后期门槛显著高于前期（前快后慢的量化下限；1.15^14 ≈ 7.1）
    expect(xpToNext(15)).toBeGreaterThan(xpToNext(1) * 5)
  })

  it('校准锚点：每波 1~1.5 颗豆——第 1 波（击杀约 15~60 经验）得 1 豆、不到 2 豆', () => {
    const wave1Low = gainXp({ level: 1, xp: 0 }, 15 + waveBonusXp(1))
    const wave1High = gainXp({ level: 1, xp: 0 }, 60 + waveBonusXp(1))
    expect(wave1Low.state.level - 1).toBeGreaterThanOrEqual(1)
    expect(wave1High.state.level - 1).toBeLessThanOrEqual(1)
  })

  it('校准锚点：18 波总量（保底约 6900 + 击杀约 7000）生涯 18~27 颗豆（每波约 1 颗出头）', () => {
    let bonus = 0
    for (let w = 1; w <= 18; w++) bonus += waveBonusXp(w)
    expect(bonus).toBeGreaterThanOrEqual(4000)
    const total = gainXp({ level: 1, xp: 0 }, bonus + 7000)
    expect(total.state.level - 1).toBeGreaterThanOrEqual(18)
    expect(total.state.level - 1).toBeLessThanOrEqual(27)
  })

  it('波末保底经验随波次缓涨', () => {
    expect(waveBonusXp(1)).toBe(XP.waveBonusBase + XP.waveBonusPerWave)
    expect(waveBonusXp(10)).toBeGreaterThan(waveBonusXp(1))
  })

  it('经验不足时不升级；恰好达到阈值即升级；连升多级余数正确', () => {
    expect(gainXp({ level: 1, xp: 0 }, xpToNext(1) - 1).levelsGained).toBe(0)
    const exact = gainXp({ level: 1, xp: 0 }, xpToNext(1))
    expect(exact.levelsGained).toBe(1)
    expect(exact.state).toEqual({ level: 2, xp: 0 })
    const multi = gainXp({ level: 1, xp: 0 }, xpToNext(1) + xpToNext(2) + 3)
    expect(multi.levelsGained).toBe(2)
    expect(multi.state).toEqual({ level: 3, xp: 3 })
  })

  it('无上限：高等级照常升级（无尽模式直接复用此曲线）', () => {
    const high = gainXp({ level: 40, xp: 0 }, xpToNext(40) + 5)
    expect(high.levelsGained).toBe(1)
    expect(high.state).toEqual({ level: 41, xp: 5 })
  })
})
