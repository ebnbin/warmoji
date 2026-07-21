import { describe, expect, it } from 'vitest'
import { CAPTAINS } from '../captains/registry'
import { CHARACTERS } from '../characters/registry'
import { ENEMY_DEFS } from '../enemies/registry'
const BLOB = ENEMY_DEFS.find((e) => e.kind === 'blob')!
const BOAR = ENEMY_DEFS.find((e) => e.kind === 'boar')!
const INVADER = ENEMY_DEFS.find((e) => e.kind === 'invader')!
const MUSHROOM = ENEMY_DEFS.find((e) => e.kind === 'mushroom')!
import { ITEMS } from '../items/registry'
import { WEAPONS } from '../weapons/registry'
import { enemyStatLines, usedEmojiSet, wikiEntryByEmoji, wikiGroups } from './wiki'

describe('图鉴分组', () => {
  it('五个分组齐全，条目数与注册表一致，条目字段非空', () => {
    const groups = wikiGroups()
    expect(groups.map((g) => g.title)).toEqual(['角色', '队长', '敌人', '武器', '道具'])
    expect(groups[0]!.entries).toHaveLength(Object.keys(CHARACTERS).length)
    expect(groups[1]!.entries).toHaveLength(Object.keys(CAPTAINS).length)
    expect(groups[2]!.entries).toHaveLength(ENEMY_DEFS.length)
    expect(groups[3]!.entries).toHaveLength(Object.keys(WEAPONS).length)
    expect(groups[4]!.entries).toHaveLength(Object.keys(ITEMS).length)
    for (const g of groups) {
      for (const e of g.entries) {
        expect(e.emoji.length).toBeGreaterThan(0)
        expect(e.name.length).toBeGreaterThan(0)
        expect(e.desc.length).toBeGreaterThan(0)
        expect(e.lines.length).toBeGreaterThan(0)
      }
    }
  })

  it('敌人属性行覆盖特殊机制：子弹/突刺/毒液/分裂', () => {
    expect(enemyStatLines(INVADER).join(' ')).toContain('子弹伤害')
    expect(enemyStatLines(BOAR).join(' ')).toContain('突刺')
    expect(enemyStatLines(MUSHROOM).join(' ')).toContain('死亡留毒')
    expect(enemyStatLines(BLOB).join(' ')).toContain('分裂 2 只小泡泡')
  })
})

describe('已收录集合', () => {
  it('覆盖角色/队长/敌人/能力图标/道具/弹体/金币（以 ordering ID 标识）', () => {
    const used = usedEmojiSet()
    expect(used.has('1f920')).toBe(true) // 🤠 牛仔
    expect(used.has('1f607')).toBe(true) // 😇 天使
    expect(used.has('1f40d')).toBe(true) // 🐍 毒蛇
    expect(used.has('1fa93')).toBe(true) // 🪓 巨斧
    expect(used.has('1f9f2')).toBe(true) // 🧲 磁铁
    expect(used.has('1f4a7')).toBe(true) // 💧 水滴
    expect(used.has('1fa99')).toBe(true) // 🪙 金币
    expect(used.size).toBeGreaterThanOrEqual(40)
  })
})

describe('emoji 反查', () => {
  it('已收录 emoji ID 能查到类别与条目', () => {
    const map = wikiEntryByEmoji()
    expect(map.get('1f920')).toMatchObject({ category: '角色', entry: { name: '牛仔' } })
    expect(map.get('1fa93')).toMatchObject({ category: '武器', entry: { name: '巨斧横扫' } })
    expect(map.get('1f417')).toMatchObject({ category: '敌人', entry: { name: '野猪' } })
    expect(map.has('1f996')).toBe(false) // 🦖 未收录
  })
})
