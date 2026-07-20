import { describe, expect, it } from 'vitest'
import { CAPTAINS, CAPTAIN_IDS } from './registry'
import { SKILL } from './skill'
import { beginRun, endRun } from '../run/state'
import { skillCharge, skillReady, tickSkillCd } from './skill'

describe('技能冷却', () => {
  it('逐帧递减到 0 为止，不会为负', () => {
    expect(tickSkillCd(1000, 400)).toBe(600)
    expect(tickSkillCd(300, 400)).toBe(0)
    expect(tickSkillCd(0, 16)).toBe(0)
  })

  it('剩余 0 才就绪', () => {
    expect(skillReady(0)).toBe(true)
    expect(skillReady(1)).toBe(false)
  })

  it('充能进度 0..1 随剩余冷却线性', () => {
    const cd = CAPTAINS.angel.skill.cdMs
    expect(skillCharge(cd, 'angel')).toBe(0)
    expect(skillCharge(cd / 2, 'angel')).toBeCloseTo(0.5)
    expect(skillCharge(0, 'angel')).toBe(1)
    // 越界钳制
    expect(skillCharge(cd * 2, 'angel')).toBe(0)
  })

  it('每位队长都配了技能：名字/描述非空，CD 为正，效果载荷是标准能力行', () => {
    for (const id of CAPTAIN_IDS) {
      const s = CAPTAINS[id].skill
      expect(s.name.length).toBeGreaterThan(0)
      expect(s.desc.length).toBeGreaterThan(0)
      expect(s.cdMs).toBeGreaterThan(0)
      expect(s.abilities.length).toBeGreaterThan(0)
      // 效果载荷是纯行为能力行（身份归队长技能本身，能力无 name/icon）
      for (const a of s.abilities) expect(a.kind.length).toBeGreaterThan(0)
    }
  })

  it('开局 CD 即就绪、0 颗豆（神童拉满 3 颗）——首放卡在挣豆上', () => {
    for (const id of CAPTAIN_IDS) {
      const run = beginRun(id, [])
      expect(run.skillCdMs).toBe(0)
      expect(run.beans).toBe(
        CAPTAINS[id].startWave > 1 ? SKILL.maxBeans : 0,
      )
      endRun()
    }
  })
})
