import { describe, expect, it } from 'vitest'
import { confineVelocity, meteorSweep } from './space'

describe('黑洞禁锢场', () => {
  const R = 10
  it('中心无阻力：向外全速放行', () => {
    const v = confineVelocity(0, 0, 0, 0, 3, 0, R)
    expect(v).toEqual({ x: 3, y: 0 })
  })
  it('边缘向外 100% 阻力：向外分量清零（逃不出去）', () => {
    // 位于正右边缘 (10,0)，向右（向外）冲
    const v = confineVelocity(10, 0, 0, 0, 5, 0, R)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(0)
  })
  it('中途向外按距离百分比衰减：半径处保留一半', () => {
    // 距中心 5（R=10）→ keep=0.5
    const v = confineVelocity(5, 0, 0, 0, 4, 0, R)
    expect(v.x).toBeCloseTo(2)
  })
  it('向内不受影响：随便回中心', () => {
    const v = confineVelocity(10, 0, 0, 0, -6, 0, R)
    expect(v.x).toBeCloseTo(-6)
  })
  it('切向不受影响：贴边绕圈自由', () => {
    // 在正右边缘，纯竖直（切向）运动
    const v = confineVelocity(10, 0, 0, 0, 0, 5, R)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(5)
  })
  it('只削向外分量：斜向外只留切向', () => {
    // 边缘处斜 45° 向外上：径向(向右)被清零，只剩向上
    const v = confineVelocity(10, 0, 0, 0, 4, 3, R)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(3)
  })
})

describe('天体横扫直线', () => {
  it('沿角度过队伍附近，两端对称外延；垂直偏移生效', () => {
    // 水平方向（angle 0），偏移 2，半长 10
    const s = meteorSweep(0, 0, 0, 2, 10)
    expect(s.dx).toBeCloseTo(1)
    expect(s.dy).toBeCloseTo(0)
    // 水平线偏移 → y 恒为偏移量
    expect(s.sy).toBeCloseTo(2)
    expect(s.ey).toBeCloseTo(2)
    // 两端对称：起点 x=-10、终点 x=10
    expect(s.sx).toBeCloseTo(-10)
    expect(s.ex).toBeCloseTo(10)
    // 中点回到偏移点
    expect((s.sx + s.ex) / 2).toBeCloseTo(0)
  })
})
