import { ORBIT } from './config'

// 环形阵轨道动力学：角色被队伍中心束缚在固定半径的环上，唯一自由度是环上角度。
// 每名角色都会按「秉性（CHARACTERS.orbit）× 探测范围内敌情」计算移动倾向，
// 但同一时刻最多一名「主力」生效（力量竞争 + 粘性防抖 + 同力随机，见 pickDriver）——
// 单源驱动杜绝了多角色倾向互相抵消。其余角色纯被动：不穿模的相邻推挤把主力的
// 动势沿环传导，匀布回复又让众人流动补位，一个人动、全环跟着动。

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

/** 敌人距离 → 威胁权重：探测范围外为 0，线性升至贴脸为 1 */
export function threatWeight(dist: number, detectRange: number): number {
  if (dist >= detectRange) return 0
  return 1 - dist / detectRange
}

/** 单个角色的目标角速度（rad/s）。多个威胁先做圆均值聚合成一个「合成方位」，
 * 避免逐敌求和时方向相互抵消——面对分散敌群也能给出果断的滑动方向。
 * 避敌（bias<0）：合成方位越贴近自己推力越大，滑向增大角距的方向；
 * 迎敌（bias>0）：转向合成方位，已对准则不动。无威胁或秉性为 0 → 0 */
export function orbitTendency(bias: number, threats: readonly OrbitThreat[]): number {
  if (bias === 0 || threats.length === 0) return 0
  let rx = 0
  let ry = 0
  for (const t of threats) {
    if (t.weight <= 0) continue
    rx += t.weight * Math.cos(t.diff)
    ry += t.weight * Math.sin(t.diff)
  }
  // 开方响应：敌人刚进探测圈就明显起步（0.04→0.2），贴近才逼近满强度
  const strength = Math.min(1, Math.sqrt(Math.hypot(rx, ry)))
  if (strength <= 0) return 0
  const diff = Math.atan2(ry, rx)
  const align = 1 - Math.abs(diff) / Math.PI // 1 = 合成威胁在自己方位，0 = 在对面
  let omega: number
  if (bias < 0) {
    // 正对（diff≈0）方向二义，取正向打破对称
    const dir = diff === 0 ? 1 : Math.sign(diff)
    omega = -bias * ORBIT.avoidGain * strength * align * dir
  } else {
    omega = bias * ORBIT.seekGain * strength * (1 - align) * -Math.sign(diff)
  }
  return Math.max(-ORBIT.maxSpeed, Math.min(ORBIT.maxSpeed, omega))
}

/** 主力竞争：力量 = 各自倾向的绝对值，最强者掌舵；现任享受粘性（挑战者须超过
 * 现任 × holdFactor 才能夺权）；并列最强随机选一；全员无力（≈0）→ −1 无主力。
 * 阵亡者传 0 力量即自然出局（现任阵亡力量归零，随即让位）。 */
export function pickDriver(
  strengths: readonly number[],
  current: number,
  rng01: () => number,
  cfg: { holdFactor: number } = ORBIT,
): number {
  const EPS = 1e-6
  let max = 0
  for (const s of strengths) max = Math.max(max, s)
  if (max <= EPS) return -1
  const held = current >= 0 ? (strengths[current] ?? 0) : 0
  if (held > EPS && max <= held * cfg.holdFactor) return current
  const top: number[] = []
  for (let i = 0; i < strengths.length; i++) {
    if (strengths[i]! >= max - EPS) top.push(i)
  }
  return top.length === 1 ? top[0]! : top[Math.floor(rng01() * top.length) % top.length]!
}

export interface OrbitConfig {
  maxSpeed: number
  spreadGain: number
  minGap: number
  iterations: number
}

/** 推进一帧。angles 按环上次序排列（相邻下标即相邻角色，首尾相接），
 * omegas 为各自的角速度（rad/s，通常只有主力非零）；dt 钳制在 50ms 内（长卡顿不瞬移）。
 * spreadMask[i]=false 的岗位不受匀布回复（主力驱动中/阵亡尸体不被拉回）。
 * 返回同次序的新角度（wrap 到 (−π, π]）。不变式：次序不变、任意相邻角距
 * ≥ min(minGap, 2π/n)（超编自动放宽；松弛为迭代法，残差 < 百分之一弧度量级）。 */
export function stepOrbit(
  angles: readonly number[],
  omegas: readonly number[],
  dtMs: number,
  cfg: OrbitConfig = ORBIT,
  spreadMask?: readonly boolean[],
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
  // 匀布回复：向两侧邻居中点缓慢靠拢（环上拉普拉斯平滑）——被动者借此
  // 流动补位/跟随主力，平静时把挤歪的分布慢慢抹回均匀
  for (let i = 0; i < n; i++) {
    const prev = i === 0 ? un[n - 1]! - TAU : un[i - 1]!
    const next = i === n - 1 ? un[0]! + TAU : un[i + 1]!
    const spread = (spreadMask?.[i] ?? true) ? cfg.spreadGain * ((prev + next) / 2 - un[i]!) : 0
    un[i] = un[i]! + clampW(omegas[i]! + spread) * dt
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
