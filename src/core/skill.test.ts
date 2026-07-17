import { describe, expect, it } from 'vitest'
import { CAPTAIN_IDS, CAPTAINS, SKILL } from './config'
import { beginRun } from './run'
import { prodigyDamage, skillCharge, skillReady, tickSkillCd } from './skill'

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

  it('每位队长都配了技能：名字/描述非空，CD 为正', () => {
    for (const id of CAPTAIN_IDS) {
      const s = CAPTAINS[id].skill
      expect(s.name.length).toBeGreaterThan(0)
      expect(s.desc.length).toBeGreaterThan(0)
      expect(s.cdMs).toBeGreaterThan(0)
    }
  })

  it('开局预充：新局剩余冷却 = CD × (1 - startCharge)', () => {
    for (const id of CAPTAIN_IDS) {
      const run = beginRun(id, [])
      expect(run.skillCdMs).toBe(Math.round(CAPTAINS[id].skill.cdMs * (1 - SKILL.startCharge)))
    }
  })
})

describe('降维打击伤害', () => {
  it('随波次血量倍率缩放，Boss 折减', () => {
    expect(prodigyDamage(1, false)).toBe(SKILL.prodigy.damage)
    expect(prodigyDamage(3, false)).toBe(SKILL.prodigy.damage * 3)
    expect(prodigyDamage(1, true)).toBe(Math.round(SKILL.prodigy.damage * SKILL.prodigy.bossRatio))
  })

  it('至少 1 点伤害', () => {
    expect(prodigyDamage(0.001, true)).toBeGreaterThanOrEqual(1)
  })
})
