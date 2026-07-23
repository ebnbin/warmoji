import { describe, expect, it } from 'vitest'
import { ABILITIES } from '../abilities/registry'
import { CAPTAINS } from '../captains/registry'
import { CHARACTERS } from '../characters/registry'
import type { CharacterId } from '../characters/registry'
import { captainStatGroups, characterStatGroups, abilityStatLines } from './stats'

const IDS = Object.keys(CHARACTERS) as CharacterId[]

describe('角色属性面板模型', () => {
  it('每个角色 = 基础组 + 专属升级组 + 每个能力一组，组内均有内容', () => {
    for (const id of IDS) {
      const groups = characterStatGroups(id)
      expect(groups).toHaveLength(2 + CHARACTERS[id].carriers.length)
      expect(groups[0]!.title).toBe('基础')
      expect(groups[1]!.title).toContain('升级路径')
      for (const g of groups) {
        expect(g.icon.length).toBeGreaterThan(0)
        expect(g.title.length).toBeGreaterThan(0)
        expect(g.lines.length).toBeGreaterThan(0)
        for (const line of g.lines) expect(line.length).toBeGreaterThan(0)
      }
    }
  })

  it('升级路径组：未达等级标注解锁条件，达到即标已获得', () => {
    const l1 = characterStatGroups('troll', [], 1)[1]!
    expect(l1.lines[0]).toContain('Lv2 解锁')
    expect(l1.lines[1]).toContain('Lv3 解锁')
    const l2 = characterStatGroups('troll', [], 2)[1]!
    expect(l2.lines[0]).toContain('✓已获得')
    expect(l2.lines[1]).toContain('Lv3 解锁')
    const l3 = characterStatGroups('troll', [], 3)[1]!
    for (const line of l3.lines) expect(line).toContain('✓已获得')
  })

  it('能力组标题含名称与类型标签；双持两把名称可区分', () => {
    const cowboy = characterStatGroups('cowboy')
    expect(cowboy[2]!.title).toBe('左轮水枪·左（投掷）')
    expect(cowboy[3]!.title).toBe('左轮水枪·右（投掷）')
    expect(characterStatGroups('mage')[2]!.title).toBe('奥术轰炸（轰炸）')
  })

  it('能力注入反映在能力展示：巨魔 2 级弧宽变 360°', () => {
    const bare = characterStatGroups('troll', [], 1)[2]!
    const leveled = characterStatGroups('troll', [], 2)[2]!
    expect(bare.lines[1]).toContain('弧宽 150°')
    expect(leveled.lines[1]).toContain('弧宽 360°')
  })

  it('数值换算：px→格、ms→秒、弧度→角度', () => {
    const horn = ABILITIES.hornThrust
    if (horn.kind !== 'thrust') throw new Error('kind 不变')
    const thrust = abilityStatLines(horn)
    expect(thrust[0]).toBe('伤害 26 · 冷却 0.9秒 · 击退 0.9格')
    expect(thrust[1]).toContain(`触及 ${horn.reach}格`)
    const sweep = abilityStatLines(ABILITIES.axeSweep)
    expect(sweep[1]).toContain('弧宽 150°')
    const blast = abilityStatLines(ABILITIES.arcaneBlast)
    expect(blast[1]).toBe('侦测 6格 · 爆炸半径 1.3格')
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
      expect(team).toContain('每波结束固定招募 1 人')
      expect(team).toContain('金币拾取')
      if (cap.xpGainMul !== 1) expect(team).toContain('经验获取')
    }
  })

  it('道具修正展示：磨刀石提升能力伤害行，生命宝石提升基础行', () => {
    const bare = characterStatGroups('troll', [])
    const dmg = characterStatGroups('troll', ['whetstone'])
    const hp = characterStatGroups('troll', ['gemHeart'])
    expect(dmg[2]!.lines[0]).not.toBe(bare[2]!.lines[0])
    expect(dmg[0]!.lines[0]).toBe(bare[0]!.lines[0])
    expect(hp[0]!.lines[0]).not.toBe(bare[0]!.lines[0])
  })
})
