import { describe, expect, it } from 'vitest'
import { MEMBER, WAVE } from './config'
import { beginRun, endRun, getRun, waveStartHp } from './run'

describe('跨波次 run 状态', () => {
  it('开新局：第 1 波、零资源、全员满血', () => {
    const run = beginRun(5)
    expect(run.wave).toBe(1)
    expect(run.coins).toBe(0)
    expect(run.kills).toBe(0)
    expect(run.xp).toEqual({ level: 1, xp: 0 })
    expect(run.memberHp).toEqual([100, 100, 100, 100, 100])
  })

  it('getRun 延续同一局；阵容人数变化或 endRun 后自动开新局', () => {
    const run = beginRun(5)
    run.coins = 42
    expect(getRun(5)).toBe(run)
    expect(getRun(6).coins).toBe(0)
    beginRun(5).coins = 7
    endRun()
    expect(getRun(5).coins).toBe(0)
  })

  it('波次开局血量：存活者延续（封顶），阵亡者低血量复活', () => {
    expect(waveStartHp(63, MEMBER.maxHp)).toBe(63)
    expect(waveStartHp(999, MEMBER.maxHp)).toBe(MEMBER.maxHp)
    expect(waveStartHp(0, MEMBER.maxHp)).toBe(Math.round(MEMBER.maxHp * WAVE.reviveHpRatio))
  })
})
