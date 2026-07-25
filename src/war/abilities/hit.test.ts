import { describe, expect, it } from 'vitest'
import { circleHitIndices, sectorHitIndices, sweepFirstHitIndex, thrustHitIndices, wrapAngle } from './hit'

describe('thrustHitIndices', () => {
  const origin = { x: 0, y: 0 }

  it('沿突刺方向、挥程内的敌人命中，挥程外未命中', () => {
    const targets = [
      { x: 50, y: 0, radius: 10 },
      { x: 100, y: 0, radius: 10 },
      { x: 130, y: 0, radius: 10 },
    ]
    // reach 100 + hitRadius 15 + 敌半径 10 → x=130 处圆心距线段末端 30 > 25，未中
    expect(thrustHitIndices(origin, 0, 100, 15, targets)).toEqual([0, 1])
  })

  it('横向偏移在 hitRadius+敌半径 内命中', () => {
    const targets = [
      { x: 50, y: 20, radius: 10 },
      { x: 50, y: 30, radius: 10 },
    ]
    expect(thrustHitIndices(origin, 0, 100, 15, targets)).toEqual([0])
  })

  it('反方向的敌人不命中（除非贴着起点）', () => {
    const targets = [
      { x: -60, y: 0, radius: 10 },
      { x: -15, y: 0, radius: 10 },
    ]
    expect(thrustHitIndices(origin, 0, 100, 15, targets)).toEqual([1])
  })

  it('一次突刺可命中多个敌人（群体伤害）', () => {
    const targets = Array.from({ length: 5 }, (_, i) => ({ x: 20 + i * 15, y: 5, radius: 8 }))
    expect(thrustHitIndices(origin, 0, 100, 15, targets)).toHaveLength(5)
  })

  it('任意角度方向正确', () => {
    const up = thrustHitIndices(origin, -Math.PI / 2, 100, 15, [{ x: 0, y: -50, radius: 8 }])
    expect(up).toEqual([0])
    const miss = thrustHitIndices(origin, -Math.PI / 2, 100, 15, [{ x: 50, y: 50, radius: 8 }])
    expect(miss).toEqual([])
  })
})

describe('circleHitIndices', () => {
  it('半径+目标半径内命中，外未命中', () => {
    const targets = [
      { x: 90, y: 0, radius: 15 },
      { x: 120, y: 0, radius: 10 },
      { x: 0, y: -100, radius: 10 },
    ]
    expect(circleHitIndices({ x: 0, y: 0 }, 100, targets)).toEqual([0, 2])
  })
})

describe('sectorHitIndices', () => {
  const origin = { x: 0, y: 0 }

  it('弧宽内命中、弧外未命中、超距未命中', () => {
    const targets = [
      { x: 80, y: 0, radius: 10 },
      { x: 0, y: 80, radius: 10 },
      { x: 200, y: 0, radius: 10 },
    ]
    // 朝右 120° 扇形
    expect(sectorHitIndices(origin, 0, (120 * Math.PI) / 180, 100, targets)).toEqual([0])
  })

  it('弧宽跨越 ±π 边界时命中正确', () => {
    const targets = [{ x: -80, y: 5, radius: 10 }]
    expect(sectorHitIndices(origin, Math.PI, Math.PI / 2, 100, targets)).toEqual([0])
  })

  it('贴身目标无视角度直接命中', () => {
    const targets = [{ x: -5, y: 0, radius: 12 }]
    expect(sectorHitIndices(origin, 0, Math.PI / 4, 100, targets)).toEqual([0])
  })
})

describe('wrapAngle', () => {
  it('归一化到 (-π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI)
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI)
    expect(wrapAngle(0.5)).toBeCloseTo(0.5)
  })
})

describe('sweepFirstHitIndex', () => {
  it('单帧大步长跨过目标也能命中（穿模防护）', () => {
    const targets = [{ x: 60, y: 0, radius: 10 }]
    expect(sweepFirstHitIndex({ x: 0, y: 0 }, { x: 200, y: 0 }, 5, targets)).toBe(0)
  })

  it('多目标取路径上最先命中者', () => {
    const targets = [
      { x: 150, y: 0, radius: 10 },
      { x: 50, y: 0, radius: 10 },
    ]
    expect(sweepFirstHitIndex({ x: 0, y: 0 }, { x: 200, y: 0 }, 5, targets)).toBe(1)
  })

  it('路径旁超出半径的目标不命中', () => {
    const targets = [{ x: 100, y: 40, radius: 10 }]
    expect(sweepFirstHitIndex({ x: 0, y: 0 }, { x: 200, y: 0 }, 5, targets)).toBe(-1)
  })

  it('零长度线段退化为原地圆判定', () => {
    const near = [{ x: 8, y: 0, radius: 10 }]
    expect(sweepFirstHitIndex({ x: 0, y: 0 }, { x: 0, y: 0 }, 5, near)).toBe(0)
    const far = [{ x: 30, y: 0, radius: 10 }]
    expect(sweepFirstHitIndex({ x: 0, y: 0 }, { x: 0, y: 0 }, 5, far)).toBe(-1)
  })
})
