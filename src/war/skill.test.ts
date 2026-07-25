import { describe, expect, it } from 'vitest'
import { CAPTAINS, CAPTAIN_IDS } from '../data/captains'
import { beginRun, endRun } from '../run/state'
import { tickSkillCd } from './skill'

describe('技能冷却', () => {
  it('逐帧递减到 0 为止，不会为负', () => {
    expect(tickSkillCd(1000, 400)).toBe(600)
    expect(tickSkillCd(300, 400)).toBe(0)
    expect(tickSkillCd(0, 16)).toBe(0)
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

  it('开局 CD 即就绪——纯 CD 门槛，可立即首放', () => {
    for (const id of CAPTAIN_IDS) {
      const run = beginRun(id, [])
      expect(run.skillCdMs).toBe(0)
      endRun()
    }
  })
})
