import { describe, expect, it } from 'vitest'
import { ORBIT } from '../config'
import { angleDiff, orbitTendency, pickDriver, stepPhase, threatWeight } from './orbit'

describe('threatWeight', () => {
  it('探测范围外为 0，线性升至贴脸为 1', () => {
    expect(threatWeight(999, 200)).toBe(0)
    expect(threatWeight(200, 200)).toBe(0)
    expect(threatWeight(100, 200)).toBeCloseTo(0.5)
    expect(threatWeight(0, 200)).toBe(1)
  })
})

describe('orbitTendency', () => {
  it('避敌：敌在自己方位附近 → 沿增大角距方向滑动', () => {
    // diff = θ − φ = +0.3：敌人在自己顺时针后方一点，应继续正向滑离
    expect(orbitTendency(-1, [{ diff: 0.3, weight: 1 }])).toBeGreaterThan(0)
    expect(orbitTendency(-1, [{ diff: -0.3, weight: 1 }])).toBeLessThan(0)
    // 敌在正对面：无滑动必要
    expect(orbitTendency(-1, [{ diff: Math.PI, weight: 1 }])).toBeCloseTo(0)
  })

  it('迎敌：转向敌人方位，已对准则不动', () => {
    expect(orbitTendency(1, [{ diff: 2, weight: 1 }])).toBeLessThan(0)
    expect(orbitTendency(1, [{ diff: -2, weight: 1 }])).toBeGreaterThan(0)
    expect(orbitTendency(1, [{ diff: 0, weight: 1 }])).toBeCloseTo(0)
  })

  it('秉性 0 或无威胁或权重 0 → 无倾向', () => {
    expect(orbitTendency(0, [{ diff: 0.5, weight: 1 }])).toBe(0)
    expect(orbitTendency(-1, [])).toBe(0)
    expect(orbitTendency(-1, [{ diff: 0.5, weight: 0 }])).toBe(0)
  })

  it('输出被钳制在最大角速度内', () => {
    const threats = Array.from({ length: 30 }, () => ({ diff: 0.4, weight: 1 }))
    expect(Math.abs(orbitTendency(-1, threats))).toBeLessThanOrEqual(ORBIT.maxSpeed)
  })

  it('圆均值聚合：一侧蜂群压过另一侧散敌，滑动方向由蜂群决定', () => {
    // 蜂群在 diff=+0.5 方向（3 个高权重），另一侧 diff=−2.8 一个弱敌
    const threats = [
      { diff: 0.5, weight: 0.9 },
      { diff: 0.6, weight: 0.8 },
      { diff: 0.4, weight: 0.9 },
      { diff: -2.8, weight: 0.3 },
    ]
    // 避敌：合成方位仍在 + 侧 → 向 + 方向滑离（逐敌求和会被反向敌拉扯抵消）
    expect(orbitTendency(-1, threats)).toBeGreaterThan(0)
  })
})

describe('pickDriver', () => {
  it('全员无力 → 无主力', () => {
    expect(pickDriver([0, 0, 0], () => 0.5)).toBe(-1)
    expect(pickDriver([], () => 0.5)).toBe(-1)
  })

  it('力量最大者即刻掌舵，无粘性（0.7 直接压过 0.6）', () => {
    expect(pickDriver([0.2, 0.9, 0.5], () => 0.5)).toBe(1)
    expect(pickDriver([0.6, 0.7], () => 0.5)).toBe(1)
  })

  it('同力随机：并列最强按随机数选一（覆盖两端）', () => {
    expect(pickDriver([0.7, 0.7, 0.1], () => 0)).toBe(0)
    expect(pickDriver([0.7, 0.7, 0.1], () => 0.999)).toBe(1)
    // 略低于最强者（超出容差）不参与平局
    expect(pickDriver([0.7, 0.69, 0.1], () => 0.999)).toBe(0)
  })

  it('阵亡（力量 0）不参与竞争', () => {
    expect(pickDriver([0, 0.4], () => 0.5)).toBe(1)
  })
})

describe('stepPhase', () => {
  it('按角速度积分并 wrap；omega 与 dt 都被钳制', () => {
    expect(stepPhase(0, 1, 16)).toBeCloseTo(0.016)
    // omega 钳制到 maxSpeed
    expect(stepPhase(0, 99, 1000)).toBeCloseTo(ORBIT.maxSpeed * 0.05)
    // dt 钳制到 50ms
    expect(stepPhase(0, 1, 5000)).toBeCloseTo(0.05)
    // wrap 到 (−π, π]
    expect(Math.abs(stepPhase(Math.PI - 0.01, 2, 50))).toBeLessThanOrEqual(Math.PI)
  })

  it('避敌整合：脆皮驱动相位把自己转到敌人对面', () => {
    // 单人环（角度 = 相位），敌人固定在方位 0：从 0.4 出发应转到远离 0 的一侧
    let phase = 0.4
    for (let s = 0; s < 300; s++) {
      const w = orbitTendency(-1, [{ diff: angleDiff(phase, 0), weight: 0.8 }])
      phase = stepPhase(phase, w, 16)
    }
    expect(Math.abs(angleDiff(phase, 0))).toBeGreaterThan(2.4)
  })
})
