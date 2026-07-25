import { describe, expect, it } from 'vitest'
import { CAPTAINS } from '../data/captains'
import { CHARACTERS } from '../data/characters'
import { BOSSES, ENEMY_DEFS } from '../data/enemies'
const BLOB = ENEMY_DEFS.find((e) => e.kind === 'blob')!
const BOAR = ENEMY_DEFS.find((e) => e.kind === 'boar')!
const INVADER = ENEMY_DEFS.find((e) => e.kind === 'invader')!
const MUSHROOM = ENEMY_DEFS.find((e) => e.kind === 'mushroom')!
import { ITEMS } from '../data/items'
import { CARDS } from '../data/cards'
import { MAP_IDS } from '../data/maps'
import { enemyStatLines, usedEmojiSet, wikiEntryByEmoji, wikiGroups } from './wiki'

describe('图鉴分组', () => {
  it('五个分组齐全（地图/队长/角色/敌人/道具），条目数与注册表一致，条目字段非空', () => {
    const groups = wikiGroups()
    expect(groups.map((g) => g.title)).toEqual(['地图', '队长', '角色', '敌人', '道具'])
    expect(groups[0]!.entries).toHaveLength(MAP_IDS.length)
    expect(groups[1]!.entries).toHaveLength(Object.keys(CAPTAINS).length)
    expect(groups[2]!.entries).toHaveLength(Object.keys(CHARACTERS).length)
    // 敌人含 Boss
    expect(groups[3]!.entries).toHaveLength(ENEMY_DEFS.length + BOSSES.length)
    // 道具含队长升级卡
    expect(groups[4]!.entries).toHaveLength(Object.keys(ITEMS).length + Object.keys(CARDS).length)
    for (const g of groups) {
      for (const e of g.entries) {
        expect(e.emoji.length).toBeGreaterThan(0)
        expect(e.name.length).toBeGreaterThan(0)
        expect(e.desc.length).toBeGreaterThan(0)
        expect(e.lines.length).toBeGreaterThan(0)
      }
    }
  })

  it('角色条目带 1/2/3 级子标签，各级属性行完全独立', () => {
    const chars = wikiGroups()[2]!
    for (const e of chars.entries) {
      expect(e.levels).toHaveLength(3)
      expect(e.levels!.map((l) => l.label)).toEqual(['1 级', '2 级', '3 级'])
    }
    // 各级独立列出解锁的能力特性：独角兽 2 级「二连突刺」、3 级再加「虹光震波」
    const unicorn = chars.entries.find((e) => e.name === '独角兽')!
    const lv = (i: number) => unicorn.levels![i]!.lines.join(' ')
    expect(lv(0)).not.toContain('二连突刺')
    expect(lv(1)).toContain('二连突刺')
    expect(lv(1)).not.toContain('虹光震波')
    expect(lv(2)).toContain('虹光震波')
    expect(lv(2)).not.toEqual(lv(1))
  })

  it('敌人属性行覆盖特殊机制：放枪/突刺/毒液/分裂', () => {
    expect(enemyStatLines(INVADER).join(' ')).toContain('放枪')
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
    expect(map.get('1f332')).toMatchObject({ category: '地图', entry: { name: '黑森林' } })
    expect(map.get('1f417')).toMatchObject({ category: '敌人', entry: { name: '野猪' } })
    // 敌人含 Boss：拆迁鬼可反查
    expect(map.get('1f98f')).toMatchObject({ category: '敌人', entry: { name: '拆迁鬼（Boss）' } })
    expect(map.has('1f996')).toBe(false) // 🦖 未收录
  })
})
