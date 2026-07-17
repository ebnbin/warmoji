import { describe, expect, it } from 'vitest'
import { CAPTAINS, LEVELS, MEMBER, ROSTER_IDS, WAVE } from './config'
import { waveDurationMs } from './waves'
import {
  beginRun,
  canRecruit,
  canUpgrade,
  currentFormation,
  endRun,
  getRun,
  guardCenter,
  guardOrder,
  isTeamFull,
  pointsAvailable,
  promoteStep,
  recruitCandidates,
  recruitMember,
  rosterCap,
  setGuardCenter,
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
    expect(run.stats).toEqual({
      damage: [0],
      kills: [0],
      deaths: [0],
      damageTaken: [0],
      enemyKills: {},
      enemyDamage: {},
      eliteKills: 0,
    })
    endRun()
  })

  it('招募时结算统计数组同步扩容', () => {
    const run = beginRun('angel', ['cowboy'])
    run.xp.level = 3
    recruitMember(run, 'mage')
    expect(run.stats.damage).toEqual([0, 0])
    expect(run.stats.kills).toEqual([0, 0])
    expect(run.stats.deaths).toEqual([0, 0])
    expect(run.stats.damageTaken).toEqual([0, 0])
    endRun()
  })

  it('神童开局带高等级：可用点数 = 开局等级 − 首发人数', () => {
    const run = beginRun('prodigy', ['cowboy', 'troll'])
    expect(run.xp.level).toBe(CAPTAINS.prodigy.startLevel)
    expect(pointsAvailable(run)).toBe(CAPTAINS.prodigy.startLevel - 2)
    endRun()
  })

  it('神童跳波开局：从 startWave 起步，难度时钟预推进被跳过波次的时长', () => {
    const run = beginRun('prodigy', [])
    expect(run.wave).toBe(CAPTAINS.prodigy.startWave)
    let skipped = 0
    for (let w = 1; w < CAPTAINS.prodigy.startWave; w++) skipped += waveDurationMs(w)
    expect(run.combatMs).toBe(skipped)
    // 15 波制下跳到第 10 波 = 5 短波 + 4 标准波
    expect(skipped).toBe(5 * WAVE.shortMs + 4 * WAVE.longMs)
    endRun()
  })

  it('常规队长仍从第 1 波零时钟开局', () => {
    const run = beginRun('angel', ['cowboy'])
    expect(run.wave).toBe(1)
    expect(run.combatMs).toBe(0)
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

  it('整编步骤：无点数 null；未满编先招募；满编后升级；全满级 null', () => {
    const run = beginRun('angel', ['cowboy'])
    expect(promoteStep(run)).toBe(null)
    run.xp.level = 3 // 2 点可用
    expect(promoteStep(run)).toBe('recruit')
    // 招满编制（天使 5 人）
    run.xp.level = 99
    while (run.roster.length < CAPTAINS.angel.teamSize) {
      expect(promoteStep(run)).toBe('recruit')
      recruitMember(run, recruitCandidates(run)[0]!)
    }
    expect(promoteStep(run)).toBe('upgrade')
    // 全员升到满级后无事可办
    for (let slot = 0; slot < run.roster.length; slot++) {
      while (upgradeMember(run, slot)) {
        /* 升到满级 */
      }
    }
    expect(run.memberLevels.every((lv) => lv === LEVELS.max)).toBe(true)
    expect(promoteStep(run)).toBe(null)
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

describe('队形状态：满员自动 N 保 1，唯一决策是保谁', () => {
  it('未满员固定环形、无中心且不可设置；满员自动变 guard', () => {
    const run = beginRun('angel', ['cowboy'])
    run.xp.level = 99
    expect(currentFormation(run)).toBe('ring')
    expect(guardCenter(run)).toBeNull()
    expect(setGuardCenter(run, 'cowboy')).toBe(false)

    while (run.roster.length < rosterCap(run)) recruitMember(run, recruitCandidates(run)[0]!)
    expect(isTeamFull(run)).toBe(true)
    expect(currentFormation(run)).toBe('guard')
    endRun()
  })

  it('中心默认 1 号位；可改为任意在编角色，不可指定编外角色', () => {
    const run = beginRun('angel', ['cowboy'])
    run.xp.level = 99
    while (run.roster.length < rosterCap(run)) recruitMember(run, recruitCandidates(run)[0]!)
    expect(guardCenter(run)).toBe('cowboy')
    const other = run.roster[2]!
    expect(setGuardCenter(run, other)).toBe(true)
    expect(guardCenter(run)).toBe(other)
    const outsider = recruitCandidates(run)[0]
    if (outsider) expect(setGuardCenter(run, outsider)).toBe(false)
    expect(run.formationIntroduced).toBe(false)
    endRun()
  })

  it('互换中心只动两个人：其他外圈岗位永不跳位', () => {
    const run = beginRun('angel', ['cowboy'])
    run.xp.level = 99
    while (run.roster.length < rosterCap(run)) recruitMember(run, recruitCandidates(run)[0]!)
    const before = guardOrder(run) // [中心, 外1, 外2, 外3, 外4]
    const target = before[3]!
    expect(setGuardCenter(run, target)).toBe(true)
    const after = guardOrder(run)
    // 新中心与旧中心互换岗位，其余原位
    expect(after[0]).toBe(target)
    expect(after[3]).toBe(before[0])
    expect(after[1]).toBe(before[1])
    expect(after[2]).toBe(before[2])
    expect(after[4]).toBe(before[4])
    // 再换回：完全还原
    expect(setGuardCenter(run, before[0]!)).toBe(true)
    expect(guardOrder(run)).toEqual(before)
    endRun()
  })
})
