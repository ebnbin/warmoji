import { describe, expect, it } from 'vitest'
import { CAPTAINS, CHARACTERS, UNIT, WEAPONS } from './config'
import type { CharacterId } from './config'
import { captainStatGroups, characterStatGroups, weaponStatLines } from './stats'

const IDS = Object.keys(CHARACTERS) as CharacterId[]

describe('角色属性面板模型', () => {
  it('每个角色 = 基础组 + 特殊能力组 + 每把武器一组，组内均有内容', () => {
    for (const id of IDS) {
      const groups = characterStatGroups(id)
      expect(groups).toHaveLength(2 + CHARACTERS[id].weapons.length)
      expect(groups[0]!.title).toBe('基础')
      expect(groups[1]!.title).toBe('特殊能力')
      for (const g of groups) {
        expect(g.icon.length).toBeGreaterThan(0)
        expect(g.title.length).toBeGreaterThan(0)
        expect(g.lines.length).toBeGreaterThan(0)
        for (const line of g.lines) expect(line.length).toBeGreaterThan(0)
      }
    }
  })

  it('特殊能力组：低等级标注未解锁，满级全解锁', () => {
    const locked = characterStatGroups('troll', [], 1)[1]!
    expect(locked.lines[0]).toContain('未解锁')
    expect(locked.lines[1]).toContain('未解锁')
    const lv3 = characterStatGroups('troll', [], 3)[1]!
    expect(lv3.lines[0]).not.toContain('未解锁')
    expect(lv3.lines[1]).toContain('未解锁')
    const maxed = characterStatGroups('troll', [], 6)[1]!
    for (const line of maxed.lines) expect(line).not.toContain('未解锁')
  })

  it('武器组标题含名称与类型标签；双持两把名称可区分', () => {
    const cowboy = characterStatGroups('cowboy')
    expect(cowboy[2]!.title).toBe('左轮水枪·左（投掷）')
    expect(cowboy[3]!.title).toBe('左轮水枪·右（投掷）')
    expect(characterStatGroups('mage')[2]!.title).toBe('奥术轰炸（轰炸）')
  })

  it('能力注入反映在武器展示：巨魔 3 级弧宽变 360°', () => {
    const lv1 = characterStatGroups('troll', [], 1)[2]!
    const lv3 = characterStatGroups('troll', [], 3)[2]!
    expect(lv1.lines[1]).toContain('弧宽 150°')
    expect(lv3.lines[1]).toContain('弧宽 360°')
  })

  it('数值换算：px→格、ms→秒、弧度→角度', () => {
    const thrust = weaponStatLines(WEAPONS.hornThrust)
    expect(thrust[0]).toBe('伤害 26 · 冷却 0.9秒 · 击退 0.9格')
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
    for (const id of IDS) {
      const base = characterStatGroups(id)[0]!
      expect(base.lines.join(' ')).not.toContain('移速')
    }
    for (const cap of Object.values(CAPTAINS)) {
      const groups = captainStatGroups(cap)
      expect(groups[0]!.lines[0]).toBe(cap.desc)
      // 主动技能组：名字进标题，描述含冷却说明
      expect(groups[1]!.title).toContain(cap.skill.name)
      expect(groups[1]!.lines[0]).toContain('冷却')
      const team = groups[2]!.lines.join(' ')
      expect(team).toContain('移速')
      expect(team).toContain(`编制上限 ${cap.teamSize} 人`)
      expect(team).toContain(`开局等级 ${cap.startLevel}`)
      expect(team).toContain('金币拾取')
      if (cap.xpGainMul !== 1) expect(team).toContain('经验获取')
    }
  })

  it('角色等级维度修正展示：巨魔 4 级生命（B 维）与 2 级伤害（A 维）生效', () => {
    const lv1 = characterStatGroups('troll', [], 1)
    const lv2 = characterStatGroups('troll', [], 2)
    const lv4 = characterStatGroups('troll', [], 4)
    expect(lv4[0]!.title).toBe('基础（Lv.4）')
    // A 维（伤害）在 2 级生效 → 武器首行变化；生命不变
    expect(lv2[2]!.lines[0]).not.toBe(lv1[2]!.lines[0])
    expect(lv2[0]!.lines[0]).toBe(lv1[0]!.lines[0])
    // B 维（生命）在 4 级生效 → 基础首行变化
    expect(lv4[0]!.lines[0]).not.toBe(lv1[0]!.lines[0])
  })
})
