import { describe, expect, it } from 'vitest'
import { FlowField, WallGrid, generateRuins, reachableCells } from './ruins'
import { Rng } from '../core/rng'

// 5×5 网格，中间竖一堵墙 x=2（行 0..3 阻挡，底行 4 留缝），cellPx=10：
// 左右半区靠底部缝连通，可测「绕墙寻路」
function wallGrid(): WallGrid {
  const cols = 5
  const rows = 5
  const blocked = new Array<boolean>(cols * rows).fill(false)
  for (let y = 0; y < rows - 1; y++) blocked[y * cols + 2] = true // x=2，行 0..3
  return new WallGrid(cols, rows, 10, blocked)
}

describe('WallGrid 视线/裁剪', () => {
  const g = wallGrid()

  it('穿墙的线段被挡，返回撞墙点（落在墙列前）', () => {
    // 从 x=5(格0) 到 x=45(格4)，横穿 x=2 墙列（世界 20..30）
    const hit = g.segmentHit(5, 5, 45, 5)
    expect(hit).not.toBeNull()
    expect(hit!.x).toBeGreaterThanOrEqual(19)
    expect(hit!.x).toBeLessThanOrEqual(21) // 墙列左沿 x=20 附近
  })

  it('不穿墙的线段视线通畅', () => {
    // 都在墙左侧（格0..1）竖向走
    expect(g.segmentHit(5, 5, 15, 45)).toBeNull()
    // 沿墙缝（格3、墙右侧）竖向走
    expect(g.segmentHit(35, 5, 35, 45)).toBeNull()
  })

  it('贴墙滑动：撞墙时保留未被挡的那一轴', () => {
    // 在格1(x=15)想往格2(x=25,墙)走，y 不变 → x 被挡回、y 放行
    const r = g.resolveMove(15, 15, 25, 25)
    expect(r.x).toBe(15) // x 撞墙保持
    expect(r.y).toBe(25) // y 放行
  })

  it('点在墙内判定', () => {
    expect(g.pointBlocked(25, 25)).toBe(true) // 格(2,2)
    expect(g.pointBlocked(15, 25)).toBe(false)
  })
})

describe('FlowField 绕墙寻路', () => {
  const g = wallGrid()

  it('墙左侧的格，方向指向绕过墙的最短路（不直接朝右穿墙）', () => {
    // 目标在墙右侧格(3,2) 世界(35,25)；采样墙左侧格(1,2) 世界(15,25)
    const ff = new FlowField(g, 3, 2)
    const dir = ff.sampleDir(15, 25)
    // 必须有明确方向（能绕过去），且不是径直朝右穿墙（应带明显纵向分量绕行）
    expect(Math.hypot(dir.x, dir.y)).toBeGreaterThan(0.5)
    expect(Math.abs(dir.y)).toBeGreaterThan(0.3)
  })

  it('目标同侧、无阻挡时方向大致指向目标', () => {
    const ff = new FlowField(g, 0, 0) // 目标格(0,0)
    const dir = ff.sampleDir(15, 15) // 格(1,1) → 应朝左上
    expect(dir.x).toBeLessThan(0)
    expect(dir.y).toBeLessThan(0)
  })
})

describe('连通与布局生成', () => {
  it('reachableCells 只收通行且连通的格', () => {
    const g = wallGrid()
    const reach = reachableCells(g, 0, 0) // 墙左半区
    expect(reach.has(0 * 5 + 0)).toBe(true)
    expect(reach.has(2 * 5 + 2)).toBe(false) // 墙格不可达
    // 墙右侧的格 (3,0) 经底部缝绕行仍连通
    expect(reach.has(0 * 5 + 3)).toBe(true)
  })

  it('generateRuins：中心开阔区必留空、且确定性（同种子同布局）', () => {
    const cols = 25
    const rows = 25
    const roll = (seed: number): boolean[] => {
      const rng = new Rng(seed)
      return generateRuins(() => rng.next(), cols, rows, { blocks: 14, maxLen: 4, centerClearU: 3 })
    }
    const a = roll(7)
    const b = roll(7)
    expect(a).toEqual(b) // 确定性
    expect(roll(8)).not.toEqual(a)
    // 中心格必空
    const mid = Math.floor(rows / 2) * cols + Math.floor(cols / 2)
    expect(a[mid]).toBe(false)
    // 中心格从自身可达（出生区连通）
    const grid = new WallGrid(cols, rows, 10, a)
    expect(reachableCells(grid, Math.floor(cols / 2), Math.floor(rows / 2)).size).toBeGreaterThan(20)
  })
})
