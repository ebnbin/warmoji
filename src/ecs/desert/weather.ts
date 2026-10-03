import { smooth } from './terrain'
import type { DesertConfig } from '../../types/maps'

const DEG = Math.PI / 180

/** 一场沙暴：开始的时刻（毫秒）与它的风往哪吹（弧度） */
export interface Storm {
  readonly at: number
  readonly angle: number
}

/** 此刻的风：风速（米/秒）、吹去的方向（弧度）、沙暴刮到几成、起沙按沙暴最猛时归一的强度 */
export interface Wind {
  speed: number
  angle: number
  level: number
  flux: number
}

/** 一场沙暴从起到落尽多久，毫秒 */
export function stormSpan(w: DesertConfig['wind']): number {
  return w.riseMs + w.holdMs + w.fallMs
}

/** 沙暴此刻刮到几成：先按 S 形起来、稳住，再按 S 形落回平时的风 */
export function stormLevel(w: DesertConfig['wind'], s: Storm | null, now: number): number {
  if (!s) return 0
  const t = now - s.at
  if (t <= 0) return 0
  if (t < w.riseMs) return smooth(0, w.riseMs, t)
  if (t < w.riseMs + w.holdMs) return 1
  return 1 - smooth(w.riseMs + w.holdMs, stormSpan(w), t)
}

/** 下一场沙暴：间隔上下抖一点，风向在盛行风两侧最多偏 veerDeg 度 */
export function nextStorm(w: DesertConfig['wind'], prevailing: number, now: number, r: () => number): { storm: Storm; next: number } {
  return {
    storm: { at: now, angle: prevailing + (r() * 2 - 1) * w.veerDeg * DEG },
    next: now + Math.max(stormSpan(w), w.intervalMs + (r() * 2 - 1) * w.jitterMs),
  }
}

/**
 * 输沙率按 Owen 的形式 q ∝ u·(u² − u_t²)：风速过了起沙的门槛才吹得动沙，往上按三次方涨；按沙暴最猛时归一，可以超过 1
 */
export function sandFlux(w: DesertConfig['wind'], speed: number): number {
  const q = (u: number): number => Math.max(0, u * (u * u - w.thresholdMs * w.thresholdMs))
  return q(speed) / q(w.stormMs)
}

/** 风一阵紧一阵松：在平均风速上按几个不同的周期起伏，确定地随时间变 */
function gustiness(now: number): number {
  const t = now / 1000
  return 1 + 0.09 * Math.sin(t * 1.7) + 0.06 * Math.sin(t * 4.3 + 1.1) + 0.04 * Math.sin(t * 9.1 + 2.3)
}

/** 此刻的风：平时顺着盛行风吹，沙暴来时风向转到这场沙暴的方向、风速涨到沙暴的风速 */
export function windAt(w: DesertConfig['wind'], prevailing: number, storm: Storm | null, now: number, out: Wind): Wind {
  const level = stormLevel(w, storm, now)
  const turn = storm ? Math.atan2(Math.sin(storm.angle - prevailing), Math.cos(storm.angle - prevailing)) : 0
  out.level = level
  out.angle = prevailing + turn * level
  out.speed = (w.breezeMs + (w.stormMs - w.breezeMs) * level) * gustiness(now)
  out.flux = sandFlux(w, out.speed)
  return out
}

/** 风沙把印子填平的速度，米/秒：平时零星的阵风也一点点填，沙暴时按输沙率填得飞快 */
export function fillRate(cfg: DesertConfig, flux: number): number {
  return cfg.tracks.calmFill + (cfg.tracks.stormFill - cfg.tracks.calmFill) * Math.min(1, flux)
}
