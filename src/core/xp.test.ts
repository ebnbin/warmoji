import { describe, expect, it } from 'vitest'
import { gainXp, xpToNext } from './xp'

describe('xp', () => {
  it('升级所需经验严格递增且为正', () => {
    for (let level = 1; level < 30; level++) {
      expect(xpToNext(level)).toBeGreaterThan(0)
      expect(xpToNext(level + 1)).toBeGreaterThan(xpToNext(level))
    }
  })

  it('经验不足时不升级', () => {
    const r = gainXp({ level: 1, xp: 0 }, xpToNext(1) - 1)
    expect(r.levelsGained).toBe(0)
    expect(r.state.level).toBe(1)
  })

  it('一次获得大量经验可连升多级，余数正确', () => {
    // L1→L2 需 base，L2→L3 需 base+perLevel
    const need = xpToNext(1) + xpToNext(2)
    const r = gainXp({ level: 1, xp: 0 }, need + 3)
    expect(r.levelsGained).toBe(2)
    expect(r.state).toEqual({ level: 3, xp: 3 })
  })

  it('恰好达到阈值即升级', () => {
    const r = gainXp({ level: 1, xp: 0 }, xpToNext(1))
    expect(r.levelsGained).toBe(1)
    expect(r.state).toEqual({ level: 2, xp: 0 })
  })
})
