import { describe, expect, it } from 'vitest'
import { fitAspectRect, ghostImages, torusDelta, torusDist2, wrapCoord, wrapPoint } from './void'

const W = 1536
const H = 864

describe('回绕', () => {
  it('wrapCoord：区间内不动，越界回绕，负数安全', () => {
    expect(wrapCoord(0, W)).toBe(0)
    expect(wrapCoord(1535, W)).toBe(1535)
    expect(wrapCoord(1536, W)).toBe(0)
    expect(wrapCoord(1600, W)).toBe(64)
    expect(wrapCoord(-1, W)).toBe(1535)
    expect(wrapCoord(-1600, W)).toBe(1472)
  })

  it('wrapPoint 两轴独立回绕', () => {
    expect(wrapPoint({ x: -10, y: 900 }, W, H)).toEqual({ x: 1526, y: 36 })
  })
})

describe('环面最短差', () => {
  it('近路不穿缝时即欧氏差', () => {
    expect(torusDelta({ x: 100, y: 100 }, { x: 300, y: 200 }, W, H)).toEqual({ x: 200, y: 100 })
  })

  it('跨缝更近时走传送门（含负向）', () => {
    // x: 1500 → 36：直走 -1464，穿缝 +72
    expect(torusDelta({ x: 1500, y: 0 }, { x: 36, y: 0 }, W, H)).toEqual({ x: 72, y: 0 })
    expect(torusDelta({ x: 36, y: 0 }, { x: 1500, y: 0 }, W, H)).toEqual({ x: -72, y: 0 })
    // y 轴同理
    expect(torusDelta({ x: 0, y: 850 }, { x: 0, y: 14 }, W, H)).toEqual({ x: 0, y: 28 })
  })

  it('分量永在 ±半场内', () => {
    for (let i = 0; i < 50; i++) {
      const d = torusDelta(
        { x: (i * 397) % W, y: (i * 211) % H },
        { x: (i * 731) % W, y: (i * 613) % H },
        W,
        H,
      )
      expect(Math.abs(d.x)).toBeLessThanOrEqual(W / 2)
      expect(Math.abs(d.y)).toBeLessThanOrEqual(H / 2)
    }
  })

  it('torusDist2 与最短差一致', () => {
    expect(torusDist2({ x: 1500, y: 850 }, { x: 36, y: 14 }, W, H)).toBe(72 * 72 + 28 * 28)
  })
})

describe('镜像坐标', () => {
  it('按半平面取平移方向：四个象限各自朝外', () => {
    // 左上象限 → 镜像在右/下/右下
    expect(ghostImages({ x: 100, y: 100 }, W, H)).toEqual([
      { x: 100 + W, y: 100 },
      { x: 100, y: 100 + H },
      { x: 100 + W, y: 100 + H },
    ])
    // 右下象限 → 镜像在左/上/左上
    expect(ghostImages({ x: 1500, y: 800 }, W, H)).toEqual([
      { x: 1500 - W, y: 800 },
      { x: 1500, y: 800 - H },
      { x: 1500 - W, y: 800 - H },
    ])
  })

  it('观察者眼中的最近镜像必在真身+三镜像中', () => {
    const target = { x: 1520, y: 840 }
    const observer = { x: 16, y: 8 }
    const candidates = [target, ...ghostImages(target, W, H)]
    const best = Math.min(
      ...candidates.map((c) => (c.x - observer.x) ** 2 + (c.y - observer.y) ** 2),
    )
    expect(best).toBe(torusDist2(observer, target, W, H))
  })
})

describe('取景框', () => {
  it('正好 16:9 的画布满幅填充', () => {
    expect(fitAspectRect(1280, 720, 1536, 864)).toEqual({ x: 0, y: 0, w: 1280, h: 720 })
  })

  it('更宽的屏幕左右留空白', () => {
    const r = fitAspectRect(1600, 720, 1536, 864)
    expect(r.h).toBe(720)
    expect(r.w).toBe(1280)
    expect(r.x).toBe(160)
    expect(r.y).toBe(0)
  })

  it('更高的屏幕（4:3）上下留空白', () => {
    const r = fitAspectRect(1280, 960, 1536, 864)
    expect(r.w).toBe(1280)
    expect(r.h).toBe(720)
    expect(r.y).toBe(120)
  })

  it('竖屏 9:16 同理', () => {
    const r = fitAspectRect(720, 1280, 864, 1536)
    expect(r).toEqual({ x: 0, y: 0, w: 720, h: 1280 })
  })
})
