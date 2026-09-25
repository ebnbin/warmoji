import { Phys } from '../../components'
import type { Sim } from '../../sim'
import type { Point } from '../../../util/vec'

export interface BodyForces {
  readonly driveX: number
  readonly driveY: number
  readonly extraX: number
  readonly extraY: number
}

/** 驱动力与地面阻力同乘抓地（鞋子 × 地面），阻力再乘介质黏度、相对介质速度计算 */
export function stepBody(sim: Sim, eid: number, x: number, y: number, f: BodyForces, grip: number, dt: number): Point {
  const s = sim.hooks.surface(sim, x, y)
  const g = grip * s.traction
  const medium = sim.hooks.mediumVelocity(sim, x, y)
  const c = Phys.drag[eid]! * g * s.viscosity
  const m = Phys.mass[eid]!
  let vx = Phys.vx[eid]!
  let vy = Phys.vy[eid]!
  vx += ((f.driveX * g - c * (vx - medium.x) + f.extraX) / m) * dt
  vy += ((f.driveY * g - c * (vy - medium.y) + f.extraY) / m) * dt
  Phys.vx[eid] = vx
  Phys.vy[eid] = vy
  return { x: x + vx * dt, y: y + vy * dt }
}

/** 位置被场地修正后，速度改按实际位移推算：撞墙的分量归零 */
export function settleBody(sim: Sim, eid: number, from: Point, to: Point, dt: number): void {
  if (dt <= 0) return
  const d = sim.hooks.worldDelta(sim, from.x, from.y, to.x, to.y)
  Phys.vx[eid] = d.x / dt
  Phys.vy[eid] = d.y / dt
}
