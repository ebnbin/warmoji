import feelJson from '../assets/feel.json'
import type { FeelTuning } from '../data/feel'

// 环形阵轨道动力学：环是刚性同步的——所有角色保持均匀间距，共享一个相位，
// 每人角度 = 均匀槽位角 + 相位。全员按「秉性（CHARACTERS.orbit）× 探测范围内敌情」
// 计算移动倾向，但每帧只有力量（倾向绝对值）最大者掌舵（同力随机、阵亡出局、
// 随时换手——环形移动平滑，频繁换手不可见），主力的倾向直接驱动相位转速：
// 一个人动，全环同一帧等量转动，等距/不穿模/无空隙由构造保证。

export interface OrbitThreat {
  /** 角色环上角与敌人方位角（都相对队伍中心）的最短角差，(−π, π] */
  diff: number
  /** 距离权重 0..1（探测范围内才 > 0） */
  weight: number
}

// 注:war/hit.ts 另有一份 wrapAngle（取模实现）。两者数值等价但浮点路径不同，
// 战斗数值对逐位一致敏感，故不合并、各自模块私有
function wrapAngle(a: number): number {
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

/** 主力竞争：力量最大者即刻掌舵（无粘性，随时换手）；并列最强（含浮点同力）
 * 随机选一；全员无力（≈0）→ −1 无主力。阵亡者传 0 力量即自然出局。 */
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

/** 相位积分：omega 钳制在最大角速度内，dt 钳制 50ms（长卡顿不瞬移），结果 wrap */
export function stepPhase(phase: number, omega: number, dtMs: number): number {
  const dt = Math.min(dtMs, 50) / 1000
  const w = Math.max(-ORBIT.maxSpeed, Math.min(ORBIT.maxSpeed, omega))
  return wrapAngle(phase + w * dt)
}

// 环形阵轨道动力学：全员按「秉性（CHARACTERS.orbit）× 探测范围内敌情」计算移动倾向，
// 每帧力量（倾向绝对值）最大者即刻掌舵（同力随机、阵亡出局、随时换手），
// 环是刚性同步的：主力驱动一个共享相位，全员保持均匀间距整体转动（本文件）。
// 数值在 defs/feel.ts（orbit 段），经 gen 校验产出 feel.json。
export const ORBIT = (feelJson as unknown as FeelTuning).orbit
