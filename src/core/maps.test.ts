import { describe, expect, it } from 'vitest'
import { arenaSceneFor, MAP_IDS, MAPS, rollDecor, sanitizeMapId } from './maps'
import { Rng } from './rng'

describe('地图定义', () => {
  it('四张图齐备且玩法互不相同：图标/名字/描述/形态/固定色板/装饰规则', () => {
    expect(MAP_IDS.length).toBe(4)
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
      'infinite',
      'river',
      'void',
    ])
    expect(MAPS.forest.kind).toBe('bounded')
    expect(MAPS.desert.kind).toBe('infinite')
    expect(MAPS.river.kind).toBe('river')
    expect(MAPS.void.kind).toBe('void')
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
      // 背景装饰必须明显小于战斗实体（1 格），不抢注意力
      expect(d.sizeU[1]).toBeLessThanOrEqual(0.8)
    }
  })

  it('sanitizeMapId：非法值回退首图', () => {
    expect(sanitizeMapId('desert')).toBe('desert')
    expect(sanitizeMapId('nope')).toBe(MAP_IDS[0])
    expect(sanitizeMapId(undefined)).toBe(MAP_IDS[0])
  })

  it('arenaSceneFor：按形态路由竞技场场景', () => {
    expect(arenaSceneFor('forest')).toBe('arena')
    expect(arenaSceneFor('desert')).toBe('arenaInfinite')
    expect(arenaSceneFor('river')).toBe('arenaRiver')
    expect(arenaSceneFor('void')).toBe('arenaVoid')
  })
})

describe('装饰散布 rollDecor', () => {
  const spec = MAPS.forest.decor

  it('数量围绕 密度×格数×噪声均值 波动；全部落在地图内、数值在配置范围内', () => {
    const rng = new Rng(42)
    const out = rollDecor(spec, () => rng.next(), 25, 25)
    // density [0.09,0.13] × 625 × 噪声均值≈0.76 ≈ 43~62 期望；噪声场加宽波动，放宽界
    expect(out.length).toBeGreaterThan(15)
    expect(out.length).toBeLessThan(110)
    for (const d of out) {
      expect(spec.emojis).toContain(d.emoji)
      expect(d.xU).toBeGreaterThanOrEqual(0)
      expect(d.xU).toBeLessThanOrEqual(25)
      expect(d.yU).toBeGreaterThanOrEqual(0)
      expect(d.yU).toBeLessThanOrEqual(25)
      expect(d.sizeU).toBeGreaterThanOrEqual(spec.sizeU[0])
      expect(d.sizeU).toBeLessThanOrEqual(spec.sizeU[1])
      expect(d.alpha).toBeGreaterThanOrEqual(spec.alpha[0])
      expect(d.alpha).toBeLessThanOrEqual(spec.alpha[1])
      expect(Math.abs(d.rotation)).toBeLessThanOrEqual(Math.PI)
    }
  })

  it('确定性：同种子同摆放（一局一景的基础），不同种子不同摆放', () => {
    const roll = (seed: number): string => {
      const rng = new Rng(seed)
      return JSON.stringify(rollDecor(spec, () => rng.next(), 25, 25))
    }
    expect(roll(7)).toBe(roll(7))
    expect(roll(7)).not.toBe(roll(8))
  })

  it('中心钳制：装饰不会探出地图边缘（含半径）', () => {
    const rng = new Rng(3)
    for (const d of rollDecor(spec, () => rng.next(), 25, 25)) {
      expect(d.xU - d.sizeU / 2).toBeGreaterThanOrEqual(-1e-9)
      expect(d.xU + d.sizeU / 2).toBeLessThanOrEqual(25 + 1e-9)
      expect(d.yU - d.sizeU / 2).toBeGreaterThanOrEqual(-1e-9)
      expect(d.yU + d.sizeU / 2).toBeLessThanOrEqual(25 + 1e-9)
    }
  })
})
