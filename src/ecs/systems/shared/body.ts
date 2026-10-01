import { UNIT } from '../../../util/units'
import { Clock } from '../../components'
import type { Point } from '../../../util/vec'
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

/** 引力随位置变时每一小步最多走多远，像素；每一小步弹道的速度最多转多少（占速度的比例），慢于 SLOW 按 SLOW 算 */
const SUBSTEP_PX = 0.2 * UNIT
const TURN = 0.08
const SLOW = 2 * UNIT
const MAX_SUBSTEPS = 32

/**
 * 在引力里被拖着漂：终速是自己的驱动 (bx, by) 加上终端漂移 g·fall，引力随位置变，就按走过的路拆成小步、每步按起点的引力趋近；
 * 进了汇（黑洞的视界）就停在那里
 */
export function drift(sim: Sim, out: BodyStep, x: number, y: number, vx: number, vy: number, bx: number, by: number, g0: Point, fall: number, k: number, dt: number): void {
  let px = x
  let py = y
  let pvx = vx
  let pvy = vy
  let gx = g0.x
  let gy = g0.y
  let left = dt
  for (let i = 0; i < MAX_SUBSTEPS && left > 1e-6 && !sim.hooks.sink(sim, px, py); i++) {
    const tx = bx + gx * fall
    const ty = by + gy * fall
    const sp = Math.max(Math.hypot(tx, ty), Math.hypot(pvx, pvy))
    const h = i === MAX_SUBSTEPS - 1 || sp <= 0 ? left : Math.min(left, SUBSTEP_PX / sp)
    approach(out, px, py, pvx, pvy, tx, ty, k, h)
    px = out.x
    py = out.y
    pvx = out.vx
    pvy = out.vy
    left -= h
    const g = sim.hooks.pull(sim, px, py)
    gx = g.x
    gy = g.y
  }
  out.x = px
  out.y = py
  out.vx = pvx
  out.vy = pvy
}

/** 弹道在随位置变的引力里飞：按走过的路与速度的转向拆成小步，速度韦尔莱积分；进了汇就停在那里、速度归零 */
export function ballistic(sim: Sim, out: BodyStep, x: number, y: number, vx: number, vy: number, g0: Point, dt: number): void {
  let px = x
  let py = y
  let pvx = vx
  let pvy = vy
  let ax = g0.x
  let ay = g0.y
  let left = dt
  for (let i = 0; i < MAX_SUBSTEPS && left > 1e-6; i++) {
    if (sim.hooks.sink(sim, px, py)) {
      pvx = 0
      pvy = 0
      break
    }
    const v = Math.hypot(pvx, pvy)
    const a = Math.hypot(ax, ay)
    let h = left
    if (i < MAX_SUBSTEPS - 1) {
      if (v > 0) h = Math.min(h, SUBSTEP_PX / v)
      if (a > 0) h = Math.min(h, (TURN * Math.max(v, SLOW)) / a)
    }
    px += pvx * h + 0.5 * ax * h * h
    py += pvy * h + 0.5 * ay * h * h
    const g = sim.hooks.pull(sim, px, py)
    pvx += 0.5 * (ax + g.x) * h
    pvy += 0.5 * (ay + g.y) * h
    ax = g.x
    ay = g.y
    left -= h
  }
  out.x = px
  out.y = py
  out.vx = pvx
  out.vy = pvy
}
