import { describe, expect, it } from 'vitest'
import {
  clampToRiver,
  crossOffset,
  driftProfile,
  flowProgress,
  flowVector,
  isHorizontal,
  pastDownstream,
  remapPoint,
  remapVector,
  riverRect,
} from './river'

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

describe('横竖屏重映射（同一条河）', () => {
  it('用户案例：横屏左侧居中（最下游）↔ 竖屏下侧居中', () => {
    const p = remapPoint({ x: 0, y: LH / 2 }, LW, LH, LH, LW)
    expect(p.x).toBeCloseTo(LH / 2)
    expect(p.y).toBeCloseTo(LW)
  })

  it('上游对上游：横屏右缘 → 竖屏顶缘', () => {
    const p = remapPoint({ x: LW, y: 300 }, LW, LH, LH, LW)
    expect(p.y).toBeCloseTo(0)
  })

  it('不镜像：横屏上岸 ↔ 竖屏左岸（逆时针 90°）', () => {
    const p = remapPoint({ x: 640, y: 0 }, LW, LH, LH, LW)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(640)
  })

  it('往返恒等（旋转过去再转回来）', () => {
    const orig = { x: 371, y: 512 }
    const there = remapPoint(orig, LW, LH, LH, LW)
    const back = remapPoint(there, LH, LW, LW, LH)
    expect(back.x).toBeCloseTo(orig.x)
    expect(back.y).toBeCloseTo(orig.y)
  })

  it('同向缩放：沿流向按比例、跨向保持绝对偏移', () => {
    const p = remapPoint({ x: 320, y: LH / 2 + 100 }, LW, LH, 1600, 800)
    expect(p.x).toBeCloseTo(400)
    expect(p.y).toBeCloseTo(500)
  })

  it('速度矢量：横→竖时水流 (-f,0)→(0,f)，往返恒等', () => {
    expect(remapVector({ x: -32, y: 0 }, true, false)).toEqual({ x: 0, y: 32 })
    expect(remapVector({ x: 0, y: 32 }, false, true)).toEqual({ x: -32, y: 0 })
    const v = { x: 7, y: -3 }
    expect(remapVector(remapVector(v, true, false), false, true)).toEqual(v)
    expect(remapVector(v, true, true)).toEqual(v)
  })
})

describe('进度/偏移/剔除/钳制', () => {
  it('flowProgress：横屏右缘 0、左缘 1；竖屏顶 0、底 1', () => {
    expect(flowProgress({ x: LW, y: 0 }, LW, LH)).toBe(0)
    expect(flowProgress({ x: 0, y: 0 }, LW, LH)).toBe(1)
    expect(flowProgress({ x: 0, y: 0 }, LH, LW)).toBe(0)
    expect(flowProgress({ x: 0, y: LW }, LH, LW)).toBe(1)
  })

  it('crossOffset 以河道中线为零点', () => {
    expect(crossOffset({ x: 0, y: LH / 2 }, LW, LH)).toBe(0)
    expect(crossOffset({ x: 0, y: LH / 2 + 50 }, LW, LH)).toBe(50)
    expect(crossOffset({ x: LH / 2 - 30, y: 0 }, LH, LW)).toBe(-30)
  })

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

  it('isHorizontal 以宽高比判向', () => {
    expect(isHorizontal(LW, LH)).toBe(true)
    expect(isHorizontal(LH, LW)).toBe(false)
  })
})
