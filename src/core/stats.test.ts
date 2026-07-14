import { describe, expect, it } from 'vitest'
import { CAPTAINS, CHARACTERS, UNIT, WEAPONS } from './config'
import { captainStatGroups, characterStatGroups, weaponStatLines } from './stats'

describe('角色属性面板模型', () => {
  it('每个角色 = 基础组 + 每把武器一组，组内均有内容', () => {
    for (const spec of Object.values(CHARACTERS)) {
      const groups = characterStatGroups(spec)
      expect(groups).toHaveLength(1 + spec.weapons.length)
      expect(groups[0]!.title).toBe('基础')
      for (const g of groups) {
        expect(g.icon.length).toBeGreaterThan(0)
        expect(g.title.length).toBeGreaterThan(0)
        expect(g.lines.length).toBeGreaterThan(0)
        for (const line of g.lines) expect(line.length).toBeGreaterThan(0)
      }
    }
  })

  it('武器组标题含名称与类型标签；双持两把名称可区分', () => {
    const cowboy = characterStatGroups(CHARACTERS.cowboy)
    expect(cowboy[1]!.title).toBe('左轮水枪·左（投掷）')
    expect(cowboy[2]!.title).toBe('左轮水枪·右（投掷）')
    expect(characterStatGroups(CHARACTERS.mage)[1]!.title).toBe('奥术轰炸（轰炸）')
  })

  it('数值换算：px→格、ms→秒、弧度→角度', () => {
    const thrust = weaponStatLines(WEAPONS.hornThrust)
    expect(thrust[0]).toBe('伤害 26 · 冷却 0.9秒')
    expect(thrust[1]).toContain(`触及 ${WEAPONS.hornThrust.reach / UNIT}格`)
    const sweep = weaponStatLines(WEAPONS.axeSweep)
    expect(sweep[1]).toContain('弧宽 150°')
    const blast = weaponStatLines(WEAPONS.arcaneBlast)
    expect(blast[1]).toBe('侦测 6格 · 爆炸半径 1.3格')
  })

  it('每把武器都有非空展示名与图标', () => {
    for (const w of Object.values(WEAPONS)) {
      expect(w.name.length).toBeGreaterThan(0)
      expect(w.icon.length).toBeGreaterThan(0)
    }
  })

  it('团队属性归队长面板，角色基础组不再含移速', () => {
    for (const c of Object.values(CHARACTERS)) {
      const base = characterStatGroups(c)[0]!
      expect(base.lines.join(' ')).not.toContain('移速')
    }
    for (const cap of Object.values(CAPTAINS)) {
      const groups = captainStatGroups(cap)
      expect(groups[0]!.lines[0]).toBe(cap.desc)
      const team = groups[1]!.lines.join(' ')
      expect(team).toContain('移速')
      expect(team).toContain(`编制上限 ${cap.teamSize} 人`)
      expect(team).toContain(`开局等级 ${cap.startLevel}`)
      expect(team).toContain('金币拾取')
      if (cap.xpGainMul !== 1) expect(team).toContain('经验获取')
    }
  })

  it('角色等级修正展示：伤害与生命随级提升', () => {
    const lv1 = characterStatGroups(CHARACTERS.unicorn, [], 1)
    const lv4 = characterStatGroups(CHARACTERS.unicorn, [], 4)
    expect(lv4[0]!.title).toBe('基础（Lv.4）')
    expect(lv4[0]!.lines[0]).not.toBe(lv1[0]!.lines[0])
    expect(lv4[1]!.lines[0]).not.toBe(lv1[1]!.lines[0])
  })
})
