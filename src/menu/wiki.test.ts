import { describe, expect, it } from 'vitest'
import { BLOB, BOAR, CAPTAINS, CHARACTERS, ENEMY_SPECS, INVADER, MUSHROOM } from '../config'
import { codepointsToEmoji, emojiCodepoints } from '../emoji/codepoints'
import { ITEMS } from '../items/registry'
import { enemyStatLines, usedEmojiSet, wikiEntryByEmoji, wikiGroups } from './wiki'

describe('图鉴分组', () => {
  it('五个分组齐全，条目数与注册表一致，条目字段非空', () => {
    const groups = wikiGroups()
    expect(groups.map((g) => g.title)).toEqual(['角色', '队长', '敌人', '武器', '道具'])
    expect(groups[0]!.entries).toHaveLength(Object.keys(CHARACTERS).length)
    expect(groups[1]!.entries).toHaveLength(Object.keys(CAPTAINS).length)
    expect(groups[2]!.entries).toHaveLength(ENEMY_SPECS.length)
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
  it('覆盖角色/队长/敌人/武器图标/道具/弹体/金币', () => {
    const used = usedEmojiSet()
    expect(used.has('🤠')).toBe(true)
    expect(used.has('😇')).toBe(true)
    expect(used.has('🐍')).toBe(true)
    expect(used.has('🪓')).toBe(true)
    expect(used.has('🧲')).toBe(true)
    expect(used.has('💧')).toBe(true)
    expect(used.has('🪙')).toBe(true)
    expect(used.size).toBeGreaterThanOrEqual(40)
  })
})

describe('emoji 反查', () => {
  it('已收录 emoji 能查到类别与条目', () => {
    const map = wikiEntryByEmoji()
    expect(map.get('🤠')).toMatchObject({ category: '角色', entry: { name: '牛仔' } })
    expect(map.get('🪓')).toMatchObject({ category: '武器', entry: { name: '巨斧横扫' } })
    expect(map.get('🐗')).toMatchObject({ category: '敌人', entry: { name: '野猪' } })
    expect(map.has('🦖')).toBe(false)
  })
})

describe('codepoint 往返', () => {
  it('文件名 → emoji → 文件名 稳定（含 ZWJ 序列与旗帜）', () => {
    for (const cp of ['1f600', '1f468-200d-1f469-200d-1f467', '1f1e6-1f1e8', '26f0']) {
      expect(emojiCodepoints(codepointsToEmoji(cp))).toBe(cp)
    }
  })
})
