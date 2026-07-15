import { describe, expect, it } from 'vitest'
import { ORBIT } from './config'
import { angleDiff, orbitTendency, pickDriver, stepOrbit, threatWeight, wrapAngle } from './orbit'

const TAU = Math.PI * 2

/** 环上相邻间隔（按传入次序，含首尾相接），全部取正 */
function gaps(angles: number[]): number[] {
  return angles.map((a, i) => {
    const b = angles[(i + 1) % angles.length]!
    let g = wrapAngle(b - a)
    if (g < 0) g += TAU
    return g
  })
}

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
    // 避敌：合成方位仍在 +  侧 → 向 + 方向滑离（逐敌求和会被反向敌拉扯抵消）
    expect(orbitTendency(-1, threats)).toBeGreaterThan(0)
  })
})

describe('pickDriver', () => {
  const rng = (): number => 0.999 // 平局时取并列末位，便于断言
  it('全员无力 → 无主力', () => {
    expect(pickDriver([0, 0, 0], -1, rng)).toBe(-1)
    expect(pickDriver([], -1, rng)).toBe(-1)
  })

  it('最强者掌舵；并列最强随机取一', () => {
    expect(pickDriver([0.2, 0.9, 0.5], -1, rng)).toBe(1)
    const tied = pickDriver([0.7, 0.7, 0.1], -1, rng)
    expect([0, 1]).toContain(tied)
  })

  it('粘性：挑战者未超过现任 × holdFactor 时现任续任，超过则夺权', () => {
    // 现任 0 号力量 0.6，挑战者 0.7 < 0.6×1.3 → 续任
    expect(pickDriver([0.6, 0.7], 0, rng)).toBe(0)
    // 挑战者 0.9 > 0.78 → 夺权
    expect(pickDriver([0.6, 0.9], 0, rng)).toBe(1)
  })

  it('现任力量归零（阵亡/敌人离开）→ 立即让位给有力者', () => {
    expect(pickDriver([0, 0.4], 0, rng)).toBe(1)
  })
})

describe('stepOrbit', () => {
  const evenRing = (n: number): number[] =>
    Array.from({ length: n }, (_, i) => wrapAngle(-Math.PI / 2 + (i * TAU) / n))

  it('自由滑动：单人按角速度积分（dt 钳制 50ms 防长卡顿瞬移）', () => {
    expect(stepOrbit([0], [1], 16)[0]).toBeCloseTo(0.016)
    expect(stepOrbit([0], [1], 5000)[0]).toBeCloseTo(0.05)
  })

  it('不穿模：高速乱推多步后任意相邻间距 ≥ 有效最小间隔（迭代残差内）', () => {
    let angles = evenRing(5)
    const omegas = [3, -3, 3, -3, 3] // 超出 maxSpeed 的乱推（会被钳制）
    for (let s = 0; s < 120; s++) angles = stepOrbit(angles, omegas, 16)
    const minGap = Math.min(ORBIT.minGap, TAU / 5)
    for (const g of gaps(angles)) expect(g).toBeGreaterThanOrEqual(minGap - 0.02)
  })

  it('推挤传导：一人猛冲，无倾向的邻居被顶着走', () => {
    // 三人贴满最小间隔挤在一段弧上，0 号向 1 号方向猛推
    const minGap = Math.min(ORBIT.minGap, TAU / 3)
    const start = [0, minGap, minGap * 2]
    let angles = [...start]
    for (let s = 0; s < 60; s++) angles = stepOrbit(angles, [1.2, 0, 0], 16)
    // 无倾向的 1、2 号都被推着前进了
    expect(wrapAngle(angles[1]! - start[1]!)).toBeGreaterThan(0.15)
    expect(wrapAngle(angles[2]! - start[2]!)).toBeGreaterThan(0.1)
    // 次序保持：0 未越过 1
    let g01 = wrapAngle(angles[1]! - angles[0]!)
    if (g01 < 0) g01 += TAU
    expect(g01).toBeGreaterThanOrEqual(minGap - 1e-6)
  })

  it('匀布回复：无倾向时挤歪的环收敛回均匀分布', () => {
    let angles = [0, 0.9, 1.8, 2.7] // 4 人挤在不到半圈里
    for (let s = 0; s < 600; s++) angles = stepOrbit(angles, [0, 0, 0, 0], 16)
    for (const g of gaps(angles)) expect(g).toBeCloseTo(TAU / 4, 1)
  })

  it('spreadMask：被掩掉的岗位不受匀布拉扯，原地不动', () => {
    const start = [0, 0.9, 1.8, 2.7]
    let angles = [...start]
    // 只有 0 号被掩（如主力驱动中/尸体），其余照常回复
    for (let s = 0; s < 200; s++) {
      angles = stepOrbit(angles, [0, 0, 0, 0], 16, ORBIT, [false, true, true, true])
    }
    expect(Math.abs(wrapAngle(angles[0]! - start[0]!))).toBeLessThan(0.05)
    expect(Math.abs(wrapAngle(angles[2]! - start[2]!))).toBeGreaterThan(0.2)
  })

  it('超编放宽：8 人 minGap 装不下时按均分解开，不发散', () => {
    // 8 × minGap(0.88) > 2π，触发放宽为 2π/8
    let angles = evenRing(8)
    const omegas = [2, -2, 2, -2, 2, -2, 2, -2]
    for (let s = 0; s < 120; s++) angles = stepOrbit(angles, omegas, 16)
    for (const a of angles) expect(Number.isFinite(a)).toBe(true)
    for (const g of gaps(angles)) expect(g).toBeGreaterThanOrEqual(TAU / 8 - 0.02)
  })

  it('避敌整合：脆皮从敌人方位滑到远侧', () => {
    // 单人环 + 敌人固定在 0 方位：从 0.4 出发应滑向远离 0 的方向
    let angle = 0.4
    for (let s = 0; s < 300; s++) {
      const w = orbitTendency(-1, [{ diff: angleDiff(angle, 0), weight: 0.8 }])
      angle = stepOrbit([angle], [w], 16)[0]!
    }
    expect(Math.abs(angleDiff(angle, 0))).toBeGreaterThan(2.4)
  })
})
