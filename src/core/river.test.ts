import { describe, expect, it } from 'vitest'
import { clampToRiver, driftProfile, flowVector, pastDownstream, riverRect } from './river'

// 标准逻辑视口：横 1280×720 / 竖 720×1280（同一设备旋转 = 长短边互换）
const LW = 1280
const LH = 720

describe('河道几何', () => {
  it('横屏：河道水平贯穿、跨轴居中、宽度恒定', () => {
    const r = riverRect(LW, LH, 640)
    expect(r).toEqual({ x: 0, y: 40, w: 1280, h: 640, horizontal: true })
  })

  it('竖屏：河道垂直贯穿、跨轴居中', () => {
    const r = riverRect(LH, LW, 640)
    expect(r).toEqual({ x: 40, y: 0, w: 640, h: 1280, horizontal: false })
  })

  it('宽于 16:9 的屏幕两岸更宽，河宽不变', () => {
    const r = riverRect(1280, 960, 640)
    expect(r.y).toBe(160)
    expect(r.h).toBe(640)
  })
})

describe('水流方向', () => {
  it('横屏右→左，竖屏上→下', () => {
    expect(flowVector(true, 32)).toEqual({ x: -32, y: 0 })
    expect(flowVector(false, 32)).toEqual({ x: 0, y: 32 })
  })
})

describe('剔除/钳制/流速剖面', () => {
  it('pastDownstream：漂出下游边界外 pad 才算', () => {
    expect(pastDownstream({ x: -10, y: 0 }, LW, LH, 64)).toBe(false)
    expect(pastDownstream({ x: -65, y: 0 }, LW, LH, 64)).toBe(true)
    expect(pastDownstream({ x: 0, y: LW + 65 }, LH, LW, 64)).toBe(true)
    expect(pastDownstream({ x: 0, y: LW + 10 }, LH, LW, 64)).toBe(false)
  })

  it('clampToRiver 带内边距钳入河道', () => {
    const r = riverRect(LW, LH, 640)
    expect(clampToRiver({ x: -5, y: 0 }, r, 32)).toEqual({ x: 32, y: 72 })
    expect(clampToRiver({ x: 2000, y: 9999 }, r, 32)).toEqual({ x: LW - 32, y: 40 + 640 - 32 })
  })

  it('driftProfile：河心 1.0，岸边 0.6，单调递减', () => {
    expect(driftProfile(0)).toBe(1)
    expect(driftProfile(1)).toBeCloseTo(0.6)
    expect(driftProfile(2)).toBeCloseTo(0.6)
    expect(driftProfile(0.5)).toBeGreaterThan(driftProfile(0.9))
  })
})
