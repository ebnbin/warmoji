import { describe, expect, it } from 'vitest'
import { CAPTAINS } from '../captains/registry'
import { MEMBER, ROSTER_IDS } from '../characters/registry'
import { RECRUIT } from './recruit'
import { WAVE } from './waves'
import {
  beginRun,
  canRecruit,
  currentFormation,
  endRun,
  getRun,
  guardCenter,
  guardOrder,
  hasCenter,
  isTeamFull,
  promoteStep,
  recruitCandidates,
  recruitDue,
  recruitMember,
  recruitUnlocked,
  rosterCap,
  setGuardCenter,
  waveStartHp,
} from './state'

describe('run 生命周期', () => {
  it('beginRun 按首发初始化：0 抽卡、技能 CD 就绪、经验从头攒', () => {
    const run = beginRun('angel', ['cowboy'])
    expect(run.wave).toBe(1)
    expect(run.xp).toEqual({ level: 1, xp: 0 })
    expect(run.cardDraws).toBe(0)
    expect(run.teamCards).toEqual({})
    expect(run.skillCdMs).toBe(0)
    expect(run.roster).toEqual(['cowboy'])
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
    run.wave = 2
    recruitMember(run, recruitCandidates(run)[0]!)
    expect(run.stats.damage).toEqual([0, 0])
    expect(run.stats.kills).toEqual([0, 0])
    expect(run.stats.deaths).toEqual([0, 0])
    expect(run.stats.damageTaken).toEqual([0, 0])
    endRun()
  })

  it('神童跳波开局：空阵容自选招满 + 开局金币 + 难度时钟预推进', () => {
    const run = beginRun('prodigy', [])
    expect(run.wave).toBe(CAPTAINS.prodigy.startWave)
    // 阵容不代填：整编页一次给足名额（波次 ≥ 编制），玩家逐个自选
    expect(run.roster).toEqual([])
    expect(promoteStep(run)).toBe('recruit')
    expect(run.coins).toBe(CAPTAINS.prodigy.startCoins)
    // 被跳过波次的时长按表累加进难度时钟
    const skipped =
      WAVE.durationsSec.slice(0, CAPTAINS.prodigy.startWave - 1).reduce((a, b) => a + b, 0) * 1000
    expect(run.combatMs).toBe(skipped)
    while (promoteStep(run) === 'recruit') recruitMember(run, recruitCandidates(run)[0]!)
    expect(run.roster.length).toBe(CAPTAINS.prodigy.teamSize)
    expect(promoteStep(run)).toBe(null)
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

describe('固定招募节奏：开局 1 人，每波结束 1 人，不可跳过', () => {
  it('名额公式：roster < min(编制, 当前波)；招满即止', () => {
    const run = beginRun('angel', ['cowboy'])
    // 第 1 波：开局名额已用（首发 1 人）
    expect(recruitDue(run)).toBe(false)
    expect(promoteStep(run)).toBe(null)
    // 第 1 波打完（wave=2）：第 2 个名额
    run.wave = 2
    expect(recruitDue(run)).toBe(true)
    expect(promoteStep(run)).toBe('recruit')
    recruitMember(run, recruitCandidates(run)[0]!)
    expect(recruitDue(run)).toBe(false)
    // 逐波推进到满编（天使 5 人：第 4 波打完招满）
    for (let wave = 3; wave <= 5; wave++) {
      run.wave = wave
      expect(promoteStep(run)).toBe('recruit')
      recruitMember(run, recruitCandidates(run)[0]!)
    }
    expect(run.roster.length).toBe(CAPTAINS.angel.teamSize)
    // 满编后任何波次都无名额
    run.wave = 15
    expect(recruitDue(run)).toBe(false)
    expect(promoteStep(run)).toBe(null)
    endRun()
  })

  it('招募约束：无名额失败、不重复、不超编', () => {
    const run = beginRun('angel', ['cowboy'])
    const pick = recruitCandidates(run)[0]!
    // 本波无名额：招募失败（首发已占掉第 1 波名额）
    expect(recruitMember(run, pick)).toBe(-1)
    run.wave = 2
    expect(canRecruit(run, 'cowboy')).toBe(false)
    expect(recruitMember(run, pick)).toBe(1)
    expect(run.memberHp[1]).toBe(MEMBER.maxHp)
    // 名额用完再招失败
    expect(recruitMember(run, recruitCandidates(run)[0]!)).toBe(-1)
    endRun()
  })

  it('命定卡池：开局抽定 10 张；候选 = 已解锁段减去已入队', () => {
    const run = beginRun('angel', [])
    expect(run.recruitPool).toHaveLength(RECRUIT.poolSize)
    expect(new Set(run.recruitPool).size).toBe(RECRUIT.poolSize)
    for (const id of run.recruitPool) expect(ROSTER_IDS).toContain(id)
    // 第 1 波：开放 1 人 → 解锁 4 张全可选
    expect(recruitUnlocked(run)).toBe(4)
    expect(recruitCandidates(run)).toEqual(run.recruitPool.slice(0, 4))
    // 招 1 人进第 2 波：解锁 6 张、去掉已入队
    const first = recruitCandidates(run)[0]!
    recruitMember(run, first)
    run.wave = 2
    expect(recruitUnlocked(run)).toBe(6)
    expect(recruitCandidates(run)).toEqual(
      run.recruitPool.slice(0, 6).filter((x) => x !== first),
    )
    // 第 5 波起全开
    run.wave = 5
    expect(recruitUnlocked(run)).toBe(10)
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

/** 招满编制（按固定节奏推波） */
function fillRoster(run: ReturnType<typeof beginRun>): void {
  while (run.roster.length < rosterCap(run)) {
    run.wave = run.roster.length + 1
    recruitMember(run, recruitCandidates(run)[0]!)
  }
}

describe('队形状态：满员自动 N 保 1，唯一决策是保谁', () => {
  it('未满员固定环形、无中心且不可设置；满员自动变 guard', () => {
    const run = beginRun('angel', ['cowboy'])
    expect(currentFormation(run)).toBe('ring')
    expect(guardCenter(run)).toBeNull()
    expect(setGuardCenter(run, 'cowboy')).toBe(false)
    fillRoster(run)
    expect(isTeamFull(run)).toBe(true)
    expect(currentFormation(run)).toBe('guard')
    endRun()
  })

  it('中心默认 1 号位；可改为任意在编角色，不可指定编外角色', () => {
    const run = beginRun('angel', ['cowboy'])
    fillRoster(run)
    expect(guardCenter(run)).toBe('cowboy')
    const other = run.roster[2]!
    expect(setGuardCenter(run, other)).toBe(true)
    expect(guardCenter(run)).toBe(other)
    const outsider = recruitCandidates(run)[0]
    if (outsider) expect(setGuardCenter(run, outsider)).toBe(false)
    expect(run.formationIntroduced).toBe(false)
    endRun()
  })

  it('达 5 人即可编排中心（大编队长未满员也行）；第 6 人加入后中心不被冲掉、只补外圈', () => {
    // 派对之星编制 6：招到 5 人时未满员，但已达「有中心」门槛
    const run = beginRun('party', ['cowboy'])
    while (run.roster.length < 5) {
      run.wave = run.roster.length + 1
      recruitMember(run, recruitCandidates(run)[0]!)
    }
    expect(run.roster.length).toBe(5)
    expect(isTeamFull(run)).toBe(false)
    expect(hasCenter(run)).toBe(true)
    expect(currentFormation(run)).toBe('guard')
    // 选第 3 人居中
    const center = run.roster[2]!
    expect(setGuardCenter(run, center)).toBe(true)
    expect(guardCenter(run)).toBe(center)
    // 招募第 6 人 → 中心保持不变，新人接到外圈末尾
    run.wave = 6
    const sixth = recruitCandidates(run)[0]!
    recruitMember(run, sixth)
    expect(run.roster.length).toBe(6)
    expect(guardCenter(run)).toBe(center)
    const order = guardOrder(run)
    expect(order[0]).toBe(center)
    expect(order[order.length - 1]).toBe(sixth)
    endRun()
  })

  it('互换中心只动两个人：其他外圈岗位永不跳位', () => {
    const run = beginRun('angel', ['cowboy'])
    fillRoster(run)
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
