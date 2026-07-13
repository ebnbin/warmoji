import { describe, expect, it } from 'vitest'
import { thrustHitIndices } from './weapons'

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
