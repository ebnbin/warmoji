import { describe, expect, it } from 'vitest'
import type { MapDecor } from './maps'
import { Rng } from './rng'
import {
  chunkDecor,
  chunkKey,
  chunkOf,
  chunksInRect,
  hash01,
  isWithinActive,
  outsideZone,
  ringPoint,
  worldNoise,
  zoneRadiusAt,
} from './world'

describe('isWithinActive（方形活跃判定）', () => {
  it('按轴距离：两轴都在半边长内才活跃', () => {
    expect(isWithinActive(31, -31, 32)).toBe(true)
    expect(isWithinActive(32, 32, 32)).toBe(true)
    expect(isWithinActive(33, 0, 32)).toBe(false)
    expect(isWithinActive(0, -33, 32)).toBe(false)
  })

  it('25×25 有界图上任意两点永不休眠（半边长 32）', () => {
    // 对角最坏情形：轴距 25 ≤ 32
    expect(isWithinActive(25, 25, 32)).toBe(true)
  })
})

describe('ringPoint（环带采样）', () => {
  it('半径始终落在 [rMin, rMax]，围绕圆心', () => {
    const rng = new Rng(42)
    for (let i = 0; i < 200; i++) {
      const p = ringPoint(rng, { x: 100, y: -50 }, 40, 90)
      const r = Math.hypot(p.x - 100, p.y + 50)
      expect(r).toBeGreaterThanOrEqual(40 - 1e-9)
      expect(r).toBeLessThanOrEqual(90 + 1e-9)
    }
  })
})

describe('分块数学', () => {
  it('chunkOf 负坐标 floor 除法正确', () => {
    expect(chunkOf(0, 8)).toBe(0)
    expect(chunkOf(7.9, 8)).toBe(0)
    expect(chunkOf(8, 8)).toBe(1)
    expect(chunkOf(-0.1, 8)).toBe(-1)
    expect(chunkOf(-8, 8)).toBe(-1)
    expect(chunkOf(-8.1, 8)).toBe(-2)
  })

  it('chunksInRect 覆盖矩形并外扩 pad', () => {
    const list = chunksInRect(-1, -1, 9, 9, 8, 1)
    const keys = new Set(list.map((c) => chunkKey(c.cx, c.cy)))
    // 矩形跨块 (-1,-1)..(1,1)，外扩 1 → (-2,-2)..(2,2) = 5×5
    expect(list).toHaveLength(25)
    expect(keys.has('-2,-2')).toBe(true)
    expect(keys.has('2,2')).toBe(true)
    expect(keys.has('3,0')).toBe(false)
  })
})

describe('hash01 / worldNoise', () => {
  it('同输入恒同输出；不同格不同值；范围 [0,1)', () => {
    expect(hash01(7, 3, -4)).toBe(hash01(7, 3, -4))
    expect(hash01(7, 3, -4)).not.toBe(hash01(7, 4, -4))
    for (let i = -20; i < 20; i++) {
      const v = hash01(123, i, i * 7)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('噪声跨晶格连续（相邻采样差值小）', () => {
    let maxStep = 0
    for (let x = -30; x < 30; x++) {
      const a = worldNoise(9, x * 0.5, 3.3, 6)
      const b = worldNoise(9, (x + 1) * 0.5, 3.3, 6)
      maxStep = Math.max(maxStep, Math.abs(a - b))
    }
    // 波长 6 格、步长 0.5 格：连续场的相邻差应远小于满幅
    expect(maxStep).toBeLessThan(0.35)
  })
})

describe('chunkDecor（分块装饰）', () => {
  const spec: MapDecor = {
    emojis: ['🌾', '🪨'],
    sizeU: [0.3, 0.6],
    alpha: [0.15, 0.25],
    density: [0.1, 0.14],
  }

  it('同 (种子, 块) 完全确定；不同块/种子不同摆放', () => {
    const a1 = chunkDecor(spec, 42, 3, -2, 8)
    const a2 = chunkDecor(spec, 42, 3, -2, 8)
    expect(a1).toEqual(a2)
    const b = chunkDecor(spec, 42, 4, -2, 8)
    const c = chunkDecor(spec, 43, 3, -2, 8)
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a1))
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a1))
  })

  it('摆放落在块附近（允许 ±1.1 格溢出），密度量级正常', () => {
    let total = 0
    for (let cx = -3; cx < 3; cx++) {
      for (let cy = -3; cy < 3; cy++) {
        const list = chunkDecor(spec, 7, cx, cy, 8)
        total += list.length
        for (const d of list) {
          expect(d.xU).toBeGreaterThanOrEqual(cx * 8 - 1.1)
          expect(d.xU).toBeLessThanOrEqual(cx * 8 + 8 + 1.1)
          expect(d.yU).toBeGreaterThanOrEqual(cy * 8 - 1.1)
          expect(d.yU).toBeLessThanOrEqual(cy * 8 + 8 + 1.1)
          expect(spec.emojis).toContain(d.emoji)
        }
      }
    }
    // 36 块 × 64 格 = 2304 格，密度 ~0.12 × 簇调制（均值 ≈0.76）→ 期望 ~200±
    expect(total).toBeGreaterThan(60)
    expect(total).toBeLessThan(500)
  })
})

describe('zoneRadiusAt（缩圈曲线）', () => {
  const spec = { r0: 120, rMin: 40, holdMs: 6000, shrinkEndMs: 38_000 }

  it('观察期恒 r0，收缩期单调递减，到底恒 rMin', () => {
    expect(zoneRadiusAt(0, spec)).toBe(120)
    expect(zoneRadiusAt(6000, spec)).toBe(120)
    const mid = zoneRadiusAt(22_000, spec)
    expect(mid).toBeLessThan(120)
    expect(mid).toBeGreaterThan(40)
    expect(zoneRadiusAt(38_000, spec)).toBe(40)
    expect(zoneRadiusAt(45_000, spec)).toBe(40)
    let prev = Infinity
    for (let t = 0; t <= 45_000; t += 1000) {
      const r = zoneRadiusAt(t, spec)
      expect(r).toBeLessThanOrEqual(prev + 1e-9)
      prev = r
    }
  })
})

describe('outsideZone', () => {
  it('圈内 false、圈外 true', () => {
    expect(outsideZone({ x: 10, y: 0 }, { x: 0, y: 0 }, 10)).toBe(false)
    expect(outsideZone({ x: 10.1, y: 0 }, { x: 0, y: 0 }, 10)).toBe(true)
  })
})
