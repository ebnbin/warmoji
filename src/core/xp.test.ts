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
    // 后期门槛显著高于前期（前快后慢的量化下限）
    expect(xpToNext(15)).toBeGreaterThan(xpToNext(1) * 10)
  })

  it('校准锚点：第 1 波（15 秒短波，击杀约 15~50 经验）应到 2~3 级，不到 4 级', () => {
    const wave1Low = gainXp({ level: 1, xp: 0 }, 15 + waveBonusXp(1))
    const wave1High = gainXp({ level: 1, xp: 0 }, 50 + waveBonusXp(1))
    expect(wave1Low.state.level).toBeGreaterThanOrEqual(2)
    expect(wave1High.state.level).toBeLessThanOrEqual(3)
  })

  it('校准锚点：15 波总量（保底约 2600 + 击杀约 3400）应触及 18 级封顶附近', () => {
    let bonus = 0
    for (let w = 1; w <= 15; w++) bonus += waveBonusXp(w)
    expect(bonus).toBeGreaterThanOrEqual(2400)
    const total = gainXp({ level: 1, xp: 0 }, bonus + 3400)
    expect(total.state.level).toBeGreaterThanOrEqual(17)
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

  it('满级封顶：到 maxLevel 停止升级并清空余量，之后不再获得经验', () => {
    const nearCap = gainXp({ level: XP.maxLevel - 1, xp: 0 }, xpToNext(XP.maxLevel - 1) + 999)
    expect(nearCap.levelsGained).toBe(1)
    expect(nearCap.state).toEqual({ level: XP.maxLevel, xp: 0 })
    const atCap = gainXp(nearCap.state, 10_000)
    expect(atCap.levelsGained).toBe(0)
    expect(atCap.state).toEqual({ level: XP.maxLevel, xp: 0 })
  })
})
