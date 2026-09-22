import { ORBIT } from '../data/feel'

// 环刚性同步：每人角度 = 均匀槽位角 + 共享相位；每帧只有倾向最强者驱动相位

export interface OrbitThreat {
  /** 最短角差，(−π, π] */
  diff: number
  /** 0..1 */
  weight: number
}

// 与 hit.ts 的 wrapAngle 浮点路径不同，战斗数值逐位敏感，不合并
function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

/** a − b 的最短角差，(−π, π] */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(a - b)
}

export function threatWeight(dist: number, detectRange: number): number {
  if (dist >= detectRange) return 0
  return 1 - dist / detectRange
}

/** rad/s；bias<0 避敌，bias>0 迎敌；多个威胁先做圆均值 */
export function orbitTendency(bias: number, threats: readonly OrbitThreat[]): number {
  if (bias === 0 || threats.length === 0) return 0
  let rx = 0
  let ry = 0
  for (const t of threats) {
    if (t.weight <= 0) continue
    rx += t.weight * Math.cos(t.diff)
    ry += t.weight * Math.sin(t.diff)
  }
  const strength = Math.min(1, Math.sqrt(Math.hypot(rx, ry)))
  if (strength <= 0) return 0
  const diff = Math.atan2(ry, rx)
  const align = 1 - Math.abs(diff) / Math.PI // 1 = 合成威胁在自己方位，0 = 在对面
  let omega: number
  if (bias < 0) {
    const dir = diff === 0 ? 1 : Math.sign(diff)
    omega = -bias * ORBIT.avoidGain * strength * align * dir
  } else {
    omega = bias * ORBIT.seekGain * strength * (1 - align) * -Math.sign(diff)
  }
  return Math.max(-ORBIT.maxSpeed, Math.min(ORBIT.maxSpeed, omega))
}

/** 并列最强随机选一；全员 ≈0 返回 −1 */
export function pickDriver(strengths: readonly number[], rng01: () => number): number {
  const EPS = 1e-6
  let max = 0
  for (const s of strengths) max = Math.max(max, s)
  if (max <= EPS) return -1
  const top: number[] = []
  for (let i = 0; i < strengths.length; i++) {
    if (strengths[i]! >= max - EPS) top.push(i)
  }
  return top.length === 1 ? top[0]! : top[Math.floor(rng01() * top.length) % top.length]!
}

export function stepPhase(phase: number, omega: number, dtMs: number): number {
  const dt = Math.min(dtMs, 50) / 1000
  const w = Math.max(-ORBIT.maxSpeed, Math.min(ORBIT.maxSpeed, omega))
  return wrapAngle(phase + w * dt)
}

