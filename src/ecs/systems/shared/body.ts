import { Clock } from '../../components'
import type { Sim } from '../../sim'

const MAX_STEP_MS = 50

export function bodyDt(sim: Sim, eid: number): number {
  return Math.min(Clock.v[eid] ? sim.dtMs : sim.wdtMs, MAX_STEP_MS) / 1000
}

/** 一个身体这一步之后的位置与速度，像素 */
export interface BodyStep {
  x: number
  y: number
  vx: number
  vy: number
}

/** 线性阻力的精确解：速度按 exp(−k·dt) 趋近终速 (tx, ty)，与帧率无关 */
export function approach(out: BodyStep, x: number, y: number, vx: number, vy: number, tx: number, ty: number, k: number, dt: number): void {
  const e = Math.exp(-k * dt)
  const glide = k > 1e-9 ? (1 - e) / k : dt
  out.x = x + tx * dt + (vx - tx) * glide
  out.y = y + ty * dt + (vy - ty) * glide
  out.vx = tx + (vx - tx) * e
  out.vy = ty + (vy - ty) * e
}
