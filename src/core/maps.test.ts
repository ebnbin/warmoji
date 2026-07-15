import { describe, expect, it } from 'vitest'
import { MAP_IDS, MAPS, rollDecor, sanitizeMapId } from './maps'
import { Rng } from './rng'

describe('地图定义', () => {
  it('三张图齐备：图标/名字/描述/固定色板/装饰规则', () => {
    expect(MAP_IDS.length).toBe(3)
    for (const id of MAP_IDS) {
      const m = MAPS[id]
      expect(m.emoji.length).toBeGreaterThan(0)
      expect(m.name.length).toBeGreaterThan(0)
      expect(m.desc.length).toBeGreaterThan(0)
      expect(m.palette.bgFrom).toContain('hsl')
      expect(m.decor.emojis.length).toBeGreaterThan(0)
    }
  })

  it('装饰规则数值健全：透明度极低、密度稀疏、范围区间有序', () => {
    for (const id of MAP_IDS) {
      const d = MAPS[id].decor
      expect(d.alpha[0]).toBeLessThanOrEqual(d.alpha[1])
      expect(d.alpha[1]).toBeLessThanOrEqual(0.15)
      expect(d.density[0]).toBeLessThanOrEqual(d.density[1])
      expect(d.density[1]).toBeLessThanOrEqual(0.2)
      expect(d.sizeU[0]).toBeLessThanOrEqual(d.sizeU[1])
      expect(d.maxTiltRad).toBeGreaterThanOrEqual(0)
    }
  })

  it('sanitizeMapId：非法值回退首图', () => {
    expect(sanitizeMapId('desert')).toBe('desert')
    expect(sanitizeMapId('nope')).toBe(MAP_IDS[0])
    expect(sanitizeMapId(undefined)).toBe(MAP_IDS[0])
  })
})

describe('装饰散布 rollDecor', () => {
  const spec = MAPS.forest.decor

  it('数量围绕 密度×格数 波动；全部落在地图内、数值在配置范围内', () => {
    const rng = new Rng(42)
    const out = rollDecor(spec, () => rng.next(), 25, 25)
    // density [0.07,0.1] × 625 = 44~63 期望；二项分布放宽到 ±3σ
    expect(out.length).toBeGreaterThan(20)
    expect(out.length).toBeLessThan(95)
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
      expect(Math.abs(d.rotation)).toBeLessThanOrEqual(spec.maxTiltRad)
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
