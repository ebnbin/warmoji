import { hasComponent, query } from 'bitecs'
import { Airborne, Alive, BreaksWalls, Dormant, Drive, Leaping, Phys, Radius, Sprinting, Transform } from '../components'
import { GROUND } from '../worlds/hooks'
import { bodyDt } from './shared/body'
import type { Sim } from '../sim'

const STILL = { x: 0, y: 0 }

/** 所有身体同一条积分；冲刺中的身体按脚本速度走，跳跃中的身体不落地，空中的身体不受地面与介质影响；位置经场地修正后速度按实际位移回推 */
export function moveBodies(sim: Sim): void {
  for (const eid of query(sim.world, [Phys, Transform, Radius])) {
    if (Dormant.v[eid] || Alive.v[eid] === 0 || Leaping.active[eid]) continue
    const dt = bodyDt(sim, eid)
    if (dt <= 0) continue
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    let vx = Phys.vx[eid]!
    let vy = Phys.vy[eid]!
    const sprinting = Sprinting.active[eid] === 1
    let next: { x: number; y: number }
    if (sprinting) {
      vx = Sprinting.vx[eid]!
      vy = Sprinting.vy[eid]!
      next = { x: x + vx * dt, y: y + vy * dt }
    } else {
      // 线性阻力的精确解：速度按 exp 衰减趋近终速（介质速度 + 驱动 / 黏度），与帧率无关
      const air = hasComponent(sim.world, eid, Airborne)
      const s = air ? GROUND : sim.hooks.surface(sim, x, y)
      const medium = air ? STILL : sim.hooks.mediumVelocity(sim, x, y)
      const k = (Phys.drag[eid]! * Phys.grip[eid]! * s.traction * s.viscosity) / Phys.mass[eid]!
      const tx = medium.x + Drive.x[eid]! / s.viscosity
      const ty = medium.y + Drive.y[eid]! / s.viscosity
      const e = Math.exp(-k * dt)
      const glide = k > 1e-9 ? (1 - e) / k : dt
      next = { x: x + tx * dt + (vx - tx) * glide, y: y + ty * dt + (vy - ty) * glide }
      vx = tx + (vx - tx) * e
      vy = ty + (vy - ty) * e
    }
    const to = sim.hooks.constrainBody(sim, eid, { x, y }, next)
    const d = sim.hooks.worldDelta(sim, x, y, to.x, to.y)
    // 被场地修正过的位移才回推速度：撞墙的分量归零；环面回绕不算修正
    if (Math.abs(d.x - (next.x - x)) > 1e-6 || Math.abs(d.y - (next.y - y)) > 1e-6) {
      vx = d.x / dt
      vy = d.y / dt
    }
    Phys.vx[eid] = vx
    Phys.vy[eid] = vy
    Transform.x[eid] = to.x
    Transform.y[eid] = to.y
    if (!sprinting) continue
    if (hasComponent(sim.world, eid, BreaksWalls)) sim.hooks.smashWall(sim, to.x, to.y)
    Sprinting.msLeft[eid] = Sprinting.msLeft[eid]! - dt * 1000
    // 被墙挡住就提前结束
    if (Math.hypot(d.x, d.y) < Math.hypot(next.x - x, next.y - y) * 0.5) Sprinting.msLeft[eid] = 0
    if (Sprinting.msLeft[eid]! <= 0) Sprinting.active[eid] = 0
  }
}
