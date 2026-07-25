import { describe, expect, it } from 'vitest'
import { bossFor, MAP, MAP_IDS, MAPS, mapEnemyRoster, rollDecor, sanitizeMapId } from './registry'
import { BOSSES } from '../enemies/registry'
import { Rng } from '../core/rng'

describe('地图定义', () => {
  it('八张图齐备且玩法互不相同：图标/名字/描述/形态/固定色板/装饰规则', () => {
    expect(MAP_IDS.length).toBe(8)
    for (const id of MAP_IDS) {
      const m = MAPS[id]
      expect(m.emoji.length).toBeGreaterThan(0)
      expect(m.name.length).toBeGreaterThan(0)
      expect(m.desc.length).toBeGreaterThan(0)
      expect(m.palette.bgFrom).toContain('hsl')
      expect(m.decor.emojis.length).toBeGreaterThan(0)
    }
    // 一种玩法一个主题：世界形态两两不同
    expect(MAP_IDS.map((id) => MAPS[id].kind).sort()).toEqual([
      'bounded',
      'daynight',
      'ice',
      'infinite',
      'river',
      'ruins',
      'space',
      'void',
    ])
    expect(MAPS.forest.kind).toBe('bounded')
    expect(MAPS.desert.kind).toBe('infinite')
    expect(MAPS.river.kind).toBe('river')
    expect(MAPS.void.kind).toBe('void')
    expect(MAPS.ruins.kind).toBe('ruins')
    expect(MAPS.daynight.kind).toBe('daynight')
    expect(MAPS.space.kind).toBe('space')
    expect(MAPS.ice.kind).toBe('ice')
    // 昼夜图有界放大到 30×30
    expect(MAPS.daynight.size).toEqual({ w: 30, h: 30 })
    // 河流图必须有水面漂浮物池
    expect(MAPS.river.drift!.length).toBeGreaterThan(0)
  })

  it('装饰规则数值健全：透明度低于战斗实体、密度稀疏、范围区间有序', () => {
    for (const id of MAP_IDS) {
      const d = MAPS[id].decor
      expect(d.alpha[0]).toBeLessThanOrEqual(d.alpha[1])
      // 战斗区内的装饰须远淡于战斗实体；河流图的装饰在岸上（战斗区外），可以更实
      expect(d.alpha[1]).toBeLessThanOrEqual(MAPS[id].kind === 'river' ? 0.5 : 0.35)
      expect(d.density[0]).toBeLessThanOrEqual(d.density[1])
      expect(d.density[1]).toBeLessThanOrEqual(0.2)
      expect(d.sizeU[0]).toBeLessThanOrEqual(d.sizeU[1])
      // 背景装饰必须明显小于战斗实体（48 标准下角色 1.2 格），不抢注意力
      expect(d.sizeU[1]).toBeLessThanOrEqual(1.0)
    }
  })

  it('sanitizeMapId：非法值回退首图', () => {
    expect(sanitizeMapId('desert')).toBe('desert')
    expect(sanitizeMapId('nope')).toBe(MAP_IDS[0])
    expect(sanitizeMapId(undefined)).toBe(MAP_IDS[0])
  })

})

describe('测试模式敌人名录按图裁剪', () => {
  it('每图名录 = 本图波次怪 + 终波 Boss + 衍生子代，无他图敌人混入', () => {
    for (const id of MAP_IDS) {
      const roster = mapEnemyRoster(id)
      const kinds = new Set<string>(roster.map((e) => e.kind))
      const mixKinds = new Set<string>(MAPS[id].mix.map((r) => r.kind))
      const boss = bossFor(id)

      // 本图 Boss 必在；其它图的 Boss 一律不得出现
      expect(kinds.has(boss.kind)).toBe(true)
      for (const b of BOSSES) {
        if (b.kind !== boss.kind) expect(kinds.has(b.kind)).toBe(false)
      }
      // 波次编排里的怪一个不落
      for (const k of mixKinds) expect(kinds.has(k)).toBe(true)
      // 名录里每一项要么在 mix、要么是本图 Boss、要么是某在册者的衍生子代
      for (const e of roster) {
        const fromMixOrBoss = mixKinds.has(e.kind) || e.kind === boss.kind
        const asChild = roster.some(
          (p) =>
            p.spawner?.into.kind === e.kind ||
            (p.onDeath ?? []).some((fx) => fx.kind === 'split' && fx.into.kind === e.kind),
        )
        expect(fromMixOrBoss || asChild).toBe(true)
      }
      // 去重
      expect(kinds.size).toBe(roster.length)
    }
  })

  it('衍生子代随亲代入册：泡泡→小泡泡（河流）、虫巢→小飞虫（工厂）', () => {
    const river = new Set(mapEnemyRoster('river').map((e) => e.kind))
    expect(river.has('blob') && river.has('blobling')).toBe(true)
    const factory = new Set(mapEnemyRoster('void').map((e) => e.kind))
    expect(factory.has('hive') && factory.has('larva')).toBe(true)
  })
})

describe('装饰散布 rollDecor', () => {
  const def = MAPS.forest.decor

  it('数量围绕 密度×格数×噪声均值 波动；全部落在地图内、数值在配置范围内', () => {
    const rng = new Rng(42)
    const out = rollDecor(def, () => rng.next(), 25, 25)
    // density [0.09,0.13] × 625 × 噪声均值≈0.76 ≈ 43~62 期望；噪声场加宽波动，放宽界
    expect(out.length).toBeGreaterThan(15)
    expect(out.length).toBeLessThan(110)
    for (const d of out) {
      expect(def.emojis).toContain(d.emoji)
      expect(d.xU).toBeGreaterThanOrEqual(0)
      expect(d.xU).toBeLessThanOrEqual(25)
      expect(d.yU).toBeGreaterThanOrEqual(0)
      expect(d.yU).toBeLessThanOrEqual(25)
      expect(d.sizeU).toBeGreaterThanOrEqual(def.sizeU[0])
      expect(d.sizeU).toBeLessThanOrEqual(def.sizeU[1])
      expect(d.alpha).toBeGreaterThanOrEqual(def.alpha[0])
      expect(d.alpha).toBeLessThanOrEqual(def.alpha[1])
      expect(Math.abs(d.rotation)).toBeLessThanOrEqual(Math.PI)
    }
  })

  it('确定性：同种子同摆放（一局一景的基础），不同种子不同摆放', () => {
    const roll = (seed: number): string => {
      const rng = new Rng(seed)
      return JSON.stringify(rollDecor(def, () => rng.next(), 25, 25))
    }
    expect(roll(7)).toBe(roll(7))
    expect(roll(7)).not.toBe(roll(8))
  })

  it('中心钳制：装饰不会探出地图边缘（含半径）', () => {
    const rng = new Rng(3)
    for (const d of rollDecor(def, () => rng.next(), 25, 25)) {
      expect(d.xU - d.sizeU / 2).toBeGreaterThanOrEqual(-1e-9)
      expect(d.xU + d.sizeU / 2).toBeLessThanOrEqual(25 + 1e-9)
      expect(d.yU - d.sizeU / 2).toBeGreaterThanOrEqual(-1e-9)
      expect(d.yU + d.sizeU / 2).toBeLessThanOrEqual(25 + 1e-9)
    }
  })
})

describe('有界地图尺寸', () => {
  it('地图 25×25 单位', () => {
    expect(MAP.width).toBe(25)
    expect(MAP.height).toBe(25)
  })
})
