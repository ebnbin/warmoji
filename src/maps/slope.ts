import { approach } from '../ecs/systems/shared/body'
import type { BodyStep } from '../ecs/systems/shared/body'
import type { Friction } from '../types/maps'
import type { Point } from '../util/vec'

/** 一个闲着的身体被动滑的速度，按实体记；uid 对不上就是换了实体 */
export interface Slip {
  uid: number
  vx: number
  vy: number
}

/** 一块斜面此刻的样子：沿斜面的重力分量（地图坐标，像素/秒²）与垂直斜面的分量，以及上面闲着的身体被动滑的速度 */
export interface Slope {
  readonly gx: number
  readonly gy: number
  readonly gn: number
  readonly slips: Map<number, Slip>
}

/**
 * 库仑摩擦（或滚动摩擦）下的一步：静止时沿斜面的重力不超过最大静摩擦 μs·gn 就不动；
 * 动起来先被重力分量加速、再被动摩擦 μk·gn 逆着速度减速，这一步里能停下就停下。
 * 滚动的东西转动惯量分走一部分：实心球的加速度是滑动时的 inertia = 5/7
 */
export function coulomb(out: BodyStep, x: number, y: number, vx: number, vy: number, gx: number, gy: number, gn: number, us: number, uk: number, inertia: number, dt: number): void {
  if (vx === 0 && vy === 0 && gx * gx + gy * gy <= (us * gn) ** 2) {
    out.x = x
    out.y = y
    out.vx = 0
    out.vy = 0
    return
  }
  let nx = vx + gx * inertia * dt
  let ny = vy + gy * inertia * dt
  const sp = Math.hypot(nx, ny)
  const drop = uk * gn * inertia * dt
  if (sp <= drop) {
    nx = 0
    ny = 0
  } else {
    nx *= 1 - drop / sp
    ny *= 1 - drop / sp
  }
  out.x = x + (vx + nx) * 0.5 * dt
  out.y = y + (vy + ny) * 0.5 * dt
  out.vx = nx
  out.vy = ny
}

/**
 * 恒定功率赶路 P = m·v·(c − g∥)：沿着前进方向的重力分量 g∥（下坡为正）让速度变成平地的 c/(c − g∥) 倍，
 * 上坡总还走得动，下坡最多快到 downhillMax 倍；c 是平地上的阻力，像素/秒²
 */
export function paceOf(gx: number, gy: number, dx: number, dy: number, c: number, max: number): number {
  const len = Math.hypot(dx, dy)
  if (len === 0) return 1
  const along = (gx * dx + gy * dy) / len
  return Math.min(max, c / Math.max(c - along, c / max))
}

const OWN: BodyStep = { x: 0, y: 0, vx: 0, vy: 0 }
const SLIDE: BodyStep = { x: 0, y: 0, vx: 0, vy: 0 }

/**
 * 斜面上一个身体的一步：自己的运动（赶路、被击退、被磁吸）照常按抓地 k 趋近期望速度 (tx, ty)；
 * 闲着时在这之上叠一份被动的滑动，按库仑摩擦 fr 由沿斜面的重力推着走，一赶路脚下站稳、滑动并进自己的运动
 */
export function slide(s: Slope, out: BodyStep, eid: number, uid: number, x: number, y: number, vx: number, vy: number, dt: number, k: number, tx: number, ty: number, walking: boolean, fr: Friction): void {
  let slip = s.slips.get(eid)
  if (slip && slip.uid !== uid) {
    s.slips.delete(eid)
    slip = undefined
  }
  if (walking) {
    if (slip) s.slips.delete(eid)
    approach(out, x, y, vx, vy, tx, ty, k, dt)
    return
  }
  const svx = slip?.vx ?? 0
  const svy = slip?.vy ?? 0
  approach(OWN, x, y, vx - svx, vy - svy, tx, ty, k, dt)
  coulomb(SLIDE, 0, 0, svx, svy, s.gx, s.gy, s.gn, fr.static, fr.kinetic, 1, dt)
  out.x = OWN.x + SLIDE.x
  out.y = OWN.y + SLIDE.y
  out.vx = OWN.vx + SLIDE.vx
  out.vy = OWN.vy + SLIDE.vy
  if (SLIDE.vx === 0 && SLIDE.vy === 0) {
    if (slip) s.slips.delete(eid)
  } else if (slip) {
    slip.vx = SLIDE.vx
    slip.vy = SLIDE.vy
  } else s.slips.set(eid, { uid, vx: SLIDE.vx, vy: SLIDE.vy })
}

/** 撞上法线朝 n 的壁面：这一步的速度与记着的被动滑动里朝壁面里的分量归零 */
export function brace(s: Slope, out: BodyStep, eid: number, n: Point): void {
  const vn = out.vx * n.x + out.vy * n.y
  if (vn < 0) {
    out.vx -= vn * n.x
    out.vy -= vn * n.y
  }
  const held = s.slips.get(eid)
  if (!held) return
  const sn = held.vx * n.x + held.vy * n.y
  if (sn < 0) {
    held.vx -= sn * n.x
    held.vy -= sn * n.y
  }
}
