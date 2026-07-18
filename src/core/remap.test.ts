import { describe, expect, it } from 'vitest'
import { isHorizontal, remapPoint, remapVector } from './remap'

// 标准逻辑视口：横 1280×720 / 竖 720×1280（同一设备旋转 = 长短边互换）
const LW = 1280
const LH = 720

describe('横竖屏重映射', () => {
  it('isHorizontal 以宽高比判向', () => {
    expect(isHorizontal(LW, LH)).toBe(true)
    expect(isHorizontal(LH, LW)).toBe(false)
  })

  it('横屏左缘中点 → 竖屏底缘中点', () => {
    const p = remapPoint({ x: 0, y: LH / 2 }, LW, LH, LH, LW)
    expect(p.x).toBeCloseTo(LH / 2)
    expect(p.y).toBeCloseTo(LW)
  })

  it('锚定：横屏右缘 → 竖屏顶缘', () => {
    const p = remapPoint({ x: LW, y: 300 }, LW, LH, LH, LW)
    expect(p.y).toBeCloseTo(0)
  })

  it('不镜像：横屏上边 → 竖屏左边（逆时针 90°）', () => {
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

  it('同向缩放：长轴按比例、跨轴保持绝对偏移', () => {
    const p = remapPoint({ x: 320, y: LH / 2 + 100 }, LW, LH, 1600, 800)
    expect(p.x).toBeCloseTo(400)
    expect(p.y).toBeCloseTo(500)
  })

  it('矢量：横→竖 (-f,0)→(0,f)，往返恒等，同向不变', () => {
    expect(remapVector({ x: -32, y: 0 }, true, false)).toEqual({ x: 0, y: 32 })
    expect(remapVector({ x: 0, y: 32 }, false, true)).toEqual({ x: -32, y: 0 })
    const v = { x: 7, y: -3 }
    expect(remapVector(remapVector(v, true, false), false, true)).toEqual(v)
    expect(remapVector(v, true, true)).toEqual(v)
  })
})
