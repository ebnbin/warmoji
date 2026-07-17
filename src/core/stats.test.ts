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
      expect(groups[1]!.title).toContain('特殊能力')
      for (const g of groups) {
        expect(g.icon.length).toBeGreaterThan(0)
        expect(g.title.length).toBeGreaterThan(0)
        expect(g.lines.length).toBeGreaterThan(0)
        for (const line of g.lines) expect(line.length).toBeGreaterThan(0)
      }
    }
  })

  it('特殊能力组：无卡标注未解锁，持一阶解锁第一条，双卡全解锁', () => {
    const locked = characterStatGroups('troll', [])[1]!
    expect(locked.lines[0]).toContain('未解锁')
    expect(locked.lines[1]).toContain('未解锁')
    const t1 = characterStatGroups('troll', ['abilityTroll1'])[1]!
    expect(t1.lines[0]).not.toContain('未解锁')
    expect(t1.lines[1]).toContain('未解锁')
    const t2 = characterStatGroups('troll', ['abilityTroll1', 'abilityTroll2'])[1]!
    for (const line of t2.lines) expect(line).not.toContain('未解锁')
  })

  it('武器组标题含名称与类型标签；双持两把名称可区分', () => {
    const cowboy = characterStatGroups('cowboy')
    expect(cowboy[2]!.title).toBe('左轮水枪·左（投掷）')
    expect(cowboy[3]!.title).toBe('左轮水枪·右（投掷）')
    expect(characterStatGroups('mage')[2]!.title).toBe('奥术轰炸（轰炸）')
  })

  it('能力注入反映在武器展示：巨魔持一阶卡弧宽变 360°', () => {
    const bare = characterStatGroups('troll', [])[2]!
    const carded = characterStatGroups('troll', ['abilityTroll1'])[2]!
    expect(bare.lines[1]).toContain('弧宽 150°')
    expect(carded.lines[1]).toContain('弧宽 360°')
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
      expect(team).toContain('每波结束固定招募 1 人')
      expect(team).toContain('金币拾取')
      if (cap.xpGainMul !== 1) expect(team).toContain('经验获取')
    }
  })

  it('道具修正展示：磨刀石提升武器伤害行，生命宝石提升基础行', () => {
    const bare = characterStatGroups('troll', [])
    const dmg = characterStatGroups('troll', ['whetstone'])
    const hp = characterStatGroups('troll', ['gemHeart'])
    expect(dmg[2]!.lines[0]).not.toBe(bare[2]!.lines[0])
    expect(dmg[0]!.lines[0]).toBe(bare[0]!.lines[0])
    expect(hp[0]!.lines[0]).not.toBe(bare[0]!.lines[0])
  })
})
