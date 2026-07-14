import { describe, expect, it } from 'vitest'
import { CAPTAINS, LEVELS, MEMBER, ROSTER_IDS, WAVE } from './config'
import {
  beginRun,
  canRecruit,
  canUpgrade,
  endRun,
  getRun,
  pointsAvailable,
  recruitCandidates,
  recruitMember,
  rosterCap,
  upgradeMember,
  waveStartHp,
} from './run'

describe('run 生命周期', () => {
  it('beginRun 按首发初始化：等级=队长开局等级、点数已花=首发人数', () => {
    const run = beginRun('angel', ['cowboy'])
    expect(run.wave).toBe(1)
    expect(run.xp.level).toBe(1)
    expect(run.pointsSpent).toBe(1)
    expect(pointsAvailable(run)).toBe(0)
    expect(run.roster).toEqual(['cowboy'])
    expect(run.memberLevels).toEqual([1])
    expect(run.memberHp).toEqual([MEMBER.maxHp])
    expect(run.memberItems).toEqual([[]])
    endRun()
  })

  it('神童开局 2 级：招 2 人后点数归零', () => {
    const run = beginRun('prodigy', ['cowboy', 'troll'])
    expect(run.xp.level).toBe(CAPTAINS.prodigy.startLevel)
    expect(pointsAvailable(run)).toBe(0)
    endRun()
  })

  it('getRun 延续同一局；endRun 后回落兜底新局', () => {
    const run = beginRun('angel', ['mage'])
    run.coins = 9
    expect(getRun()).toBe(run)
    endRun()
    const fresh = getRun()
    expect(fresh.coins).toBe(0)
    expect(fresh.roster.length).toBe(1)
    endRun()
  })
})

describe('点数经济：招募与升级', () => {
  it('升级得点，点可招募（入队 1 级满血）或给角色升级', () => {
    const run = beginRun('angel', ['cowboy'])
    run.xp.level = 3 // 模拟升了 2 级 → 2 点可用
    expect(pointsAvailable(run)).toBe(2)

    const slot = recruitMember(run, 'mage')
    expect(slot).toBe(1)
    expect(run.roster).toEqual(['cowboy', 'mage'])
    expect(run.memberLevels[1]).toBe(1)
    expect(run.memberHp[1]).toBe(MEMBER.maxHp)
    expect(pointsAvailable(run)).toBe(1)

    expect(upgradeMember(run, 0)).toBe(true)
    expect(run.memberLevels[0]).toBe(2)
    expect(pointsAvailable(run)).toBe(0)

    // 没点了：招募/升级都失败
    expect(recruitMember(run, 'troll')).toBe(-1)
    expect(upgradeMember(run, 1)).toBe(false)
    endRun()
  })

  it('招募约束：不重复、不超编制上限', () => {
    const run = beginRun('angel', ['cowboy'])
    run.xp.level = 99
    expect(canRecruit(run, 'cowboy')).toBe(false)
    for (const id of recruitCandidates(run).slice(0, rosterCap(run) - 1)) recruitMember(run, id)
    expect(run.roster.length).toBe(CAPTAINS.angel.teamSize)
    expect(canRecruit(run, recruitCandidates(run)[0]!)).toBe(false)
    endRun()
  })

  it('升级约束：满级不可再升', () => {
    const run = beginRun('angel', ['cowboy'])
    run.xp.level = 99
    for (let i = 1; i < LEVELS.max; i++) expect(upgradeMember(run, 0)).toBe(true)
    expect(run.memberLevels[0]).toBe(LEVELS.max)
    expect(canUpgrade(run, 0)).toBe(false)
    expect(canUpgrade(run, 5)).toBe(false)
    endRun()
  })

  it('候选 = 花名册减去已招募', () => {
    const run = beginRun('angel', ['cowboy'])
    expect(recruitCandidates(run)).toEqual(ROSTER_IDS.filter((x) => x !== 'cowboy'))
    endRun()
  })
})

describe('waveStartHp', () => {
  it('存活者延续血量并按上限截断；阵亡者低血量复活', () => {
    expect(waveStartHp(64, 100)).toBe(64)
    expect(waveStartHp(150, 100)).toBe(100)
    expect(waveStartHp(0, 100)).toBe(Math.round(100 * WAVE.reviveHpRatio))
  })
})
