import { hasComponent, query } from 'bitecs'
import { Airborne, Alive, BreaksWalls, Dormant, Drive, Motion, MOTION, Phys, Radius, Transform, VisOff } from '../components'
import { GROUND } from '../worlds/hooks'
import { bodyDt } from './shared/body'
import { endMotion } from './shared/displace'
import { isSameEntity } from '../utils/identity'
import type { Sim } from '../sim'

const STILL = { x: 0, y: 0 }

/** 弧线：沿起止点插值、画面上抬起，到点落地并记下 landed */
function stepArc(sim: Sim, eid: number, dt: number): void {
  const t = Math.min(Motion.ms[eid]!, Motion.t[eid]! + dt * 1000)
  Motion.t[eid] = t
  const p = t / Motion.ms[eid]!
  const fx = Motion.fx[eid]!
  const fy = Motion.fy[eid]!
  const to = sim.hooks.wrap(sim, fx + (Motion.tx[eid]! - fx) * p, fy + (Motion.ty[eid]! - fy) * p)
  Transform.x[eid] = to.x
  Transform.y[eid] = to.y
  Phys.vx[eid] = Motion.vx[eid]!
  Phys.vy[eid] = Motion.vy[eid]!
  VisOff.y[eid] = -Math.sin(Math.PI * p) * Motion.h[eid]!
  if (p < 1) return
  VisOff.y[eid] = 0
  Motion.kind[eid] = MOTION.none
  Motion.landed[eid] = 1
}

/** 跟随：贴着宿主的偏移处，宿主没了或到时就松开 */
function stepFollow(sim: Sim, eid: number, dt: number): void {
  Motion.t[eid] = Motion.t[eid]! + dt * 1000
  const host = Motion.ref[eid]!
  if (!isSameEntity(sim.world, host, Motion.refUid[eid]!) || !Alive.v[host] || (Motion.ms[eid]! > 0 && Motion.t[eid]! >= Motion.ms[eid]!)) {
    endMotion(eid)
    return
  }
  const to = sim.hooks.wrap(sim, Transform.x[host]! + Motion.tx[eid]!, Transform.y[host]! + Motion.ty[eid]!)
  Transform.x[eid] = to.x
  Transform.y[eid] = to.y
  Phys.vx[eid] = Phys.vx[host]!
  Phys.vy[eid] = Phys.vy[host]!
}

/** 追着目标冲：速度大小不变、方向对准目标，目标没了就直冲；碰到目标返回 true */
function seek(sim: Sim, eid: number): boolean {
  const t = Motion.ref[eid]!
  if (!isSameEntity(sim.world, t, Motion.refUid[eid]!) || !Alive.v[t]) {
    Motion.seek[eid] = 0
    return false
  }
  const d = sim.hooks.worldDelta(sim, Transform.x[eid]!, Transform.y[eid]!, Transform.x[t]!, Transform.y[t]!)
  const dist = Math.hypot(d.x, d.y)
  if (dist <= Radius.v[eid]! + Radius.v[t]!) return true
  const speed = Math.hypot(Motion.vx[eid]!, Motion.vy[eid]!)
  Motion.vx[eid] = (d.x / dist) * speed
  Motion.vy[eid] = (d.y / dist) * speed
  return false
}

/** 所有身体同一条积分；冲刺中的身体按脚本速度走，弧线中的身体腾空，跟随中的身体贴着宿主，空中的身体不受地面与介质影响；位置经场地修正后速度按实际位移回推 */
export function moveBodies(sim: Sim): void {
  for (const eid of query(sim.world, [Phys, Transform, Radius])) {
    if (Dormant.v[eid] || Alive.v[eid] === 0) continue
    const dt = bodyDt(sim, eid)
    if (dt <= 0) continue
    const kind = Motion.kind[eid]
    if (kind === MOTION.arc) {
      stepArc(sim, eid, dt)
      continue
    }
    if (kind === MOTION.follow) {
      stepFollow(sim, eid, dt)
      continue
    }
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    let vx = Phys.vx[eid]!
    let vy = Phys.vy[eid]!
    const dashing = kind === MOTION.dash
    if (dashing && Motion.seek[eid] && seek(sim, eid)) {
      Motion.t[eid] = Motion.ms[eid]!
      Motion.kind[eid] = MOTION.none
      Motion.landed[eid] = 1
      continue
    }
    let next: { x: number; y: number }
    if (dashing) {
      vx = Motion.vx[eid]!
      vy = Motion.vy[eid]!
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
    if (!dashing) continue
    if (hasComponent(sim.world, eid, BreaksWalls)) sim.hooks.smashWall(sim, to.x, to.y)
    Motion.t[eid] = Motion.t[eid]! + dt * 1000
    // 被墙挡住就提前结束，被摆布的身体记下撞墙
    if (Math.hypot(d.x, d.y) < Math.hypot(next.x - x, next.y - y) * 0.5) {
      Motion.t[eid] = Motion.ms[eid]!
      Motion.landed[eid] = 2
    }
    if (Motion.t[eid]! >= Motion.ms[eid]!) {
      Motion.kind[eid] = MOTION.none
      if (Motion.landed[eid] !== 2) Motion.landed[eid] = 1
    }
  }
}
