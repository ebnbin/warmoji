import { query } from 'bitecs'
import { FOLLOW_IN_MS } from '../../data/abilities'
import { Alive, Drive, Motion, MOTION, Phys, Radius, Span, Transform, VisOff } from '../components'
import { breachAt, LAYER_M } from '../utils/pass'
import { hoverPx } from '../utils/ground'
import { GROUND } from '../worlds/hooks'
import { approach, ballistic, bodyDt, drift } from './shared/body'
import type { BodyStep } from './shared/body'
import { endMotion, transitFlash } from './shared/displace'
import { isSameEntity } from '../utils/identity'
import { sineEaseInOut } from '../utils/ease'
import type { Sim } from '../sim'

const STILL = { x: 0, y: 0 }
const STEP: BodyStep = { x: 0, y: 0, vx: 0, vy: 0 }

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
  VisOff.y[eid] = -hoverPx(eid) - Math.sin(Math.PI * p) * Motion.h[eid]!
  if (p < 1) return
  VisOff.y[eid] = -hoverPx(eid)
  Motion.kind[eid] = MOTION.none
  Motion.landed[eid] = 1
}

/** 穿行：沿直线缓入缓出地移到落点，途中没有实体；到点现身并记下 landed */
function stepTransit(sim: Sim, eid: number, dt: number): void {
  const t = Math.min(Motion.ms[eid]!, Motion.t[eid]! + dt * 1000)
  Motion.t[eid] = t
  const p = sineEaseInOut(t / Motion.ms[eid]!)
  const fx = Motion.fx[eid]!
  const fy = Motion.fy[eid]!
  const to = sim.hooks.wrap(sim, fx + (Motion.tx[eid]! - fx) * p, fy + (Motion.ty[eid]! - fy) * p)
  Transform.x[eid] = to.x
  Transform.y[eid] = to.y
  if (t < Motion.ms[eid]!) {
    Phys.vx[eid] = Motion.vx[eid]!
    Phys.vy[eid] = Motion.vy[eid]!
    return
  }
  Phys.vx[eid] = 0
  Phys.vy[eid] = 0
  Motion.kind[eid] = MOTION.none
  Motion.landed[eid] = 1
  transitFlash(sim, eid, to.x, to.y, true)
}

/** 跟随：先从原处被拉到宿主的偏移处，再贴着走，宿主没了或到时就松开 */
function stepFollow(sim: Sim, eid: number, dt: number): void {
  Motion.t[eid] = Motion.t[eid]! + dt * 1000
  const host = Motion.ref[eid]!
  if (!isSameEntity(sim.world, host, Motion.refUid[eid]!) || !Alive.v[host] || (Motion.ms[eid]! > 0 && Motion.t[eid]! >= Motion.ms[eid]!)) {
    endMotion(eid)
    return
  }
  const fx = Motion.fx[eid]!
  const fy = Motion.fy[eid]!
  const d = sim.hooks.worldDelta(sim, fx, fy, Transform.x[host]! + Motion.tx[eid]!, Transform.y[host]! + Motion.ty[eid]!)
  const p = sineEaseInOut(Math.min(1, Motion.t[eid]! / FOLLOW_IN_MS))
  const to = sim.hooks.wrap(sim, fx + d.x * p, fy + d.y * p)
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

/** 所有身体同一条积分；冲刺中的身体按脚本速度走、受引力加速，弧线中的身体腾空，穿行中的身体沿直线移过去，跟随中的身体贴着宿主，悬空的身体不受地面与介质影响、照样受引力；地面自己有接触力学的由它接管；位置经场地修正后速度按实际位移回推 */
export function moveBodies(sim: Sim): void {
  for (const eid of query(sim.world, [Phys, Transform, Radius])) {
    if (Alive.v[eid] === 0) continue
    const dt = bodyDt(sim, eid)
    if (dt <= 0) continue
    const kind = Motion.kind[eid]
    if (kind === MOTION.arc) {
      stepArc(sim, eid, dt)
      continue
    }
    if (kind === MOTION.transit) {
      stepTransit(sim, eid, dt)
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
    const g = sim.hooks.pull(sim, x, y)
    const pulled = g.x !== 0 || g.y !== 0
    if (dashing) {
      // 冲刺按自己的速度走，引力照样加速它
      if (pulled) {
        ballistic(sim, STEP, x, y, Motion.vx[eid]!, Motion.vy[eid]!, g, dt)
        Motion.vx[eid] = STEP.vx
        Motion.vy[eid] = STEP.vy
        next = { x: STEP.x, y: STEP.y }
      } else next = { x: x + Motion.vx[eid]! * dt, y: y + Motion.vy[eid]! * dt }
      vx = Motion.vx[eid]!
      vy = Motion.vy[eid]!
    } else {
      const air = Span.lo[eid]! > 0
      if (air || !sim.hooks.contact(sim, eid, dt, x, y, vx, vy, STEP)) {
        // 线性阻力的精确解：速度按 exp 衰减趋近终速（介质速度 + 驱动 / 黏度 + 引力的终端漂移 g·质量/阻力）
        const s = air ? GROUND : sim.hooks.surface(sim, x, y)
        const medium = air ? STILL : sim.hooks.mediumVelocity(sim, x, y)
        const k = (Phys.drag[eid]! * Phys.grip[eid]! * s.traction * s.viscosity) / Phys.mass[eid]!
        const bx = medium.x + Drive.x[eid]! / s.viscosity
        const by = medium.y + Drive.y[eid]! / s.viscosity
        if (pulled) drift(sim, STEP, x, y, vx, vy, bx, by, g, Phys.mass[eid]! / Phys.drag[eid]!, k, dt)
        else approach(STEP, x, y, vx, vy, bx, by, k, dt)
      }
      next = { x: STEP.x, y: STEP.y }
      vx = STEP.vx
      vy = STEP.vy
    }
    // 带破坏力的冲刺先把前方撞上的障碍打掉，打不穿的剩下的照样挡住它
    if (dashing && Motion.breach[eid]! > 0) {
      const sp = Math.hypot(vx, vy) || 1
      const r = Radius.v[eid]!
      Motion.breach[eid] = Motion.breach[eid]! - breachAt(sim, next.x + (vx / sp) * r * 0.6, next.y + (vy / sp) * r * 0.6, ((Span.lo[eid]! + Span.hi[eid]! + 1) / 2) * LAYER_M, r, Motion.breach[eid]!)
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
