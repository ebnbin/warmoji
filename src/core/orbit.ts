import { ORBIT } from './config'

// 环形阵轨道动力学：角色被队伍中心束缚在固定半径的环上，唯一自由度是环上角度。
// 「移动倾向」由探测范围内的敌人方位 × 角色秉性（CHARACTERS.orbit）决定：
// 避敌者沿环滑向背敌侧，迎敌者滑向敌人方位。相邻次序永不改变（不穿模），
// 重叠通过相邻对松弛对半推开——推力沿相邻链传导，形成「顶着走」的推挤感。

export interface OrbitThreat {
  /** 角色环上角与敌人方位角（都相对队伍中心）的最短角差，(−π, π] */
  diff: number
  /** 距离权重 0..1（探测范围内才 > 0） */
  weight: number
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

/** a − b 的最短角差，(−π, π] */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(a - b)
}

/** 敌人距离 → 威胁权重：探测范围外为 0，越近越强（二次衰减） */
export function threatWeight(dist: number, detectRange: number): number {
  if (dist >= detectRange) return 0
  const t = 1 - dist / detectRange
  return t * t
}

/** 单个角色的目标角速度（rad/s）。
 * 避敌（bias<0）：敌人方位与自己越重合推力越大，滑向增大角距的方向；
 * 迎敌（bias>0）：转向敌人方位，已对准则不动。无威胁或秉性为 0 → 0 */
export function orbitTendency(bias: number, threats: readonly OrbitThreat[]): number {
  if (bias === 0 || threats.length === 0) return 0
  let omega = 0
  for (const t of threats) {
    if (t.weight <= 0) continue
    const align = 1 - Math.abs(t.diff) / Math.PI // 1 = 敌在正对自己的方位，0 = 在对面
    if (bias < 0) {
      // 正对（diff≈0）方向二义，取正向打破对称
      const dir = t.diff === 0 ? 1 : Math.sign(t.diff)
      omega += -bias * ORBIT.avoidGain * t.weight * align * dir
    } else {
      omega += bias * ORBIT.seekGain * t.weight * (1 - align) * -Math.sign(t.diff)
    }
  }
  return Math.max(-ORBIT.maxSpeed, Math.min(ORBIT.maxSpeed, omega))
}

export interface OrbitConfig {
  maxSpeed: number
  spreadGain: number
  minGap: number
  iterations: number
}

/** 推进一帧。angles 按环上次序排列（相邻下标即相邻角色，首尾相接），
 * omegas 为各自的目标角速度（rad/s）；dt 钳制在 50ms 内（长卡顿不瞬移）。
 * 返回同次序的新角度（wrap 到 (−π, π]）。不变式：次序不变、任意相邻角距
 * ≥ min(minGap, 2π/n)（超编自动放宽；松弛为迭代法，残差 < 百分之一弧度量级）。 */
export function stepOrbit(
  angles: readonly number[],
  omegas: readonly number[],
  dtMs: number,
  cfg: OrbitConfig = ORBIT,
): number[] {
  const n = angles.length
  const dt = Math.min(dtMs, 50) / 1000
  if (n === 0) return []
  const clampW = (w: number): number => Math.max(-cfg.maxSpeed, Math.min(cfg.maxSpeed, w))
  if (n === 1) return [wrapAngle(angles[0]! + clampW(omegas[0]!) * dt)]

  // 展开成单调递增序列（沿正向逐个取相邻间隔），绕圈从此不需要特殊分支
  const un: number[] = [angles[0]!]
  for (let i = 1; i < n; i++) {
    let gap = wrapAngle(angles[i]! - angles[i - 1]!)
    if (gap < 0) gap += Math.PI * 2
    un.push(un[i - 1]! + gap)
  }

  const TAU = Math.PI * 2
  // 匀布回复：向两侧邻居中点缓慢靠拢（环上拉普拉斯平滑），
  // 平静时把被挤歪的分布慢慢抹回均匀，强度弱于主动倾向
  for (let i = 0; i < n; i++) {
    const prev = i === 0 ? un[n - 1]! - TAU : un[i - 1]!
    const next = i === n - 1 ? un[0]! + TAU : un[i + 1]!
    const spread = cfg.spreadGain * ((prev + next) / 2 - un[i]!)
    un[i] = un[i]! + (clampW(omegas[i]! + spread)) * dt
  }

  // 相邻对约束松弛：间距不足就对半推开（含首尾相接对）；
  // 超编（n×minGap > 2π）时放宽到均分，保证有解
  const minGap = Math.min(cfg.minGap, TAU / n)
  for (let iter = 0; iter < cfg.iterations; iter++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const gap = (j === 0 ? un[0]! + TAU : un[j]!) - un[i]!
      if (gap >= minGap) continue
      const d = (minGap - gap) / 2
      un[i] = un[i]! - d
      un[j] = un[j]! + d
    }
  }

  return un.map(wrapAngle)
}
