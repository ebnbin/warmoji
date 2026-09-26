import { hasComponent } from 'bitecs'
import { BODY_MAX_SPEED } from '../../../data/abilities'
import { Anchored, Ctl, MARK, Motion, MOTION, Phys, Transform, Uid, VisOff } from '../../components'
import { hasMark } from '../../utils/marks'
import { motionFx } from '../../store'
import type { Effect } from '../../../types/abilityDefs'
import type { Source } from '../../utils/source'
import type { Sim } from '../../sim'

/** 一段位移：push 是冲量；drift 是这一帧被一股稳定的流带着（持续牵引），折成与阻力相当的冲量；dash 沿直线按速度走；arc 腾空飞到落点；follow 贴着另一个身体；place 直接落到新位置 */
export type Displacement =
  | { readonly kind: 'push'; readonly x: number; readonly y: number }
  | { readonly kind: 'drift'; readonly vx: number; readonly vy: number; readonly dt: number }
  | { readonly kind: 'dash'; readonly angle: number; readonly distance: number; readonly ms: number }
  | { readonly kind: 'arc'; readonly x: number; readonly y: number; readonly ms: number; readonly height: number }
  | { readonly kind: 'follow'; readonly host: number; readonly ox: number; readonly oy: number; readonly ms: number }
  | { readonly kind: 'place'; readonly x: number; readonly y: number }

/** 谁在推：self 是自己的动作，做不做得出来看 Ctl.dash；否则是被摆布，锚定的身体不吃；skill 是带来位移的能力；src 与 onLand/onWall 是被摆布后落地、撞墙时的后续 */
export interface Mover {
  readonly self: boolean
  /** 一个动作的收尾（如瞬袭闪回）：不再看能不能动 */
  readonly free?: boolean
  readonly skill?: number
  readonly src?: Source
  readonly onLand?: readonly Effect[]
  readonly onWall?: readonly Effect[]
  /** 落地、撞墙效果的基础伤害 */
  readonly base?: number
}

export const FORCED: Mover = { self: false }

/** 冲量按质量折成速度；只封顶冲量带来的增量，不压低本来就更快的身体 */
function impulse(sim: Sim, eid: number, jx: number, jy: number): void {
  if (!hasComponent(sim.world, eid, Phys) || hasComponent(sim.world, eid, Anchored)) return
  const m = Phys.mass[eid]!
  const ox = Phys.vx[eid]!
  const oy = Phys.vy[eid]!
  let vx = ox + jx / m
  let vy = oy + jy / m
  const len = Math.hypot(vx, vy)
  const cap = Math.max(BODY_MAX_SPEED, Math.hypot(ox, oy))
  if (len > cap) {
    vx = (vx / len) * cap
    vy = (vy / len) * cap
  }
  Phys.vx[eid] = vx
  Phys.vy[eid] = vy
}

/** 能不能这样动：自己的动作看 Ctl.dash；被摆布时锚定与霸体的身体不吃 */
export function movable(sim: Sim, eid: number, by: Mover): boolean {
  if (!hasComponent(sim.world, eid, Phys)) return false
  if (by.free) return true
  return by.self ? Ctl.dash[eid] === 1 : !hasComponent(sim.world, eid, Anchored) && !hasMark(sim, eid, MARK.unstoppable)
}

/** 结束手头的脚本位移：弧线中的身体落回地面 */
export function endMotion(eid: number): void {
  if (Motion.kind[eid] === MOTION.arc) VisOff.y[eid] = 0
  Motion.kind[eid] = MOTION.none
  Motion.skill[eid] = 0
  motionFx[eid] = undefined
}

/** 唯一的位移入口：敌我、角色与敌人、自己的动作与被摆布都从这里改变身体的位置 */
export function displace(sim: Sim, eid: number, d: Displacement, by: Mover): boolean {
  if (d.kind === 'push') {
    if (hasMark(sim, eid, MARK.unstoppable)) return false
    impulse(sim, eid, d.x, d.y)
    return true
  }
  if (d.kind === 'drift') {
    if (hasMark(sim, eid, MARK.unstoppable) || !hasComponent(sim.world, eid, Phys) || Motion.kind[eid] !== MOTION.none) return false
    const s = sim.hooks.surface(sim, Transform.x[eid]!, Transform.y[eid]!)
    const k = Phys.drag[eid]! * Phys.grip[eid]! * s.traction * s.viscosity * d.dt
    impulse(sim, eid, d.vx * k, d.vy * k)
    return true
  }
  if (!movable(sim, eid, by)) return false
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  endMotion(eid)
  if (d.kind === 'place') {
    const to = sim.hooks.constrainBody(sim, eid, { x, y }, { x: d.x, y: d.y })
    Transform.x[eid] = to.x
    Transform.y[eid] = to.y
    Phys.vx[eid] = 0
    Phys.vy[eid] = 0
    return true
  }
  Motion.t[eid] = 0
  Motion.self[eid] = by.self ? 1 : 0
  Motion.landed[eid] = 0
  Motion.skill[eid] = by.skill ?? 0
  Motion.stamp[eid] = sim.elapsedMs
  if (by.src) motionFx[eid] = { src: by.src, onLand: by.onLand, onWall: by.onWall, base: by.base ?? 0 }
  if (d.kind === 'dash') {
    const speed = d.distance / Math.max(1e-3, d.ms / 1000)
    Motion.kind[eid] = MOTION.dash
    Motion.ms[eid] = d.ms
    Motion.vx[eid] = Math.cos(d.angle) * speed
    Motion.vy[eid] = Math.sin(d.angle) * speed
    return true
  }
  if (d.kind === 'arc') {
    // 落点先经场地约束，再折算回起点附近，环面上才不会跨图飞
    const to = sim.hooks.constrainBody(sim, eid, { x, y }, { x: d.x, y: d.y })
    const dd = sim.hooks.worldDelta(sim, x, y, to.x, to.y)
    Motion.kind[eid] = MOTION.arc
    Motion.ms[eid] = Math.max(1, d.ms)
    Motion.fx[eid] = x
    Motion.fy[eid] = y
    Motion.tx[eid] = x + dd.x
    Motion.ty[eid] = y + dd.y
    Motion.h[eid] = d.height
    Motion.vx[eid] = (dd.x / Motion.ms[eid]!) * 1000
    Motion.vy[eid] = (dd.y / Motion.ms[eid]!) * 1000
    return true
  }
  Motion.kind[eid] = MOTION.follow
  Motion.ms[eid] = d.ms
  Motion.ref[eid] = d.host
  Motion.refUid[eid] = Uid.v[d.host]!
  Motion.tx[eid] = d.ox
  Motion.ty[eid] = d.oy
  return true
}
