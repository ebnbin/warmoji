import { addComponents, hasComponent, query, removeEntity } from 'bitecs'
import { newEntity } from './entity'
import { Alive, Barrier, FACTION, Faction, Hp, Phasing, Radius, Transform, Uid } from '../components'
import { barrierCross, barrierSide, barrierSrc } from '../store'
import { isSameEntity } from '../utils/identity'
import { applyAbilityEffects } from '../systems/shared/effects'
import type { Effect } from '../../types/abilityDefs'
import type { Source } from '../utils/source'
import type { Point } from '../../util/vec'
import type { Sim } from '../sim'

export const BARRIER_THICK = 7

interface BarrierSpec {
  readonly shape: 'wall' | 'ring'
  readonly x: number
  readonly y: number
  readonly angle: number
  readonly length: number
  readonly durationMs: number
  readonly bodies: 'all' | 'foes' | 'none'
  readonly shots: boolean
  readonly reflect: boolean
  readonly follow: number
  readonly onCross?: readonly Effect[]
  readonly color: number
  readonly src: Source
}

const BODIES = { none: 0, foes: 1, all: 2 } as const

/** 立一面墙：墙垂直于 angle、以 (x, y) 为中点；圈以 (x, y) 为心 */
export function spawnBarrier(sim: Sim, spec: BarrierSpec): number {
  const e = newEntity(sim.world)
  addComponents(sim.world, e, Barrier, Faction)
  Faction.v[e] = spec.src.faction
  Barrier.shape[e] = spec.shape === 'wall' ? 0 : 1
  const half = spec.length / 2
  const px = -Math.sin(spec.angle)
  const py = Math.cos(spec.angle)
  Barrier.ax[e] = spec.x - px * half
  Barrier.ay[e] = spec.y - py * half
  Barrier.bx[e] = spec.x + px * half
  Barrier.by[e] = spec.y + py * half
  Barrier.cx[e] = spec.x
  Barrier.cy[e] = spec.y
  Barrier.r[e] = spec.length
  Barrier.thick[e] = BARRIER_THICK
  Barrier.until[e] = sim.elapsedMs + spec.durationMs
  Barrier.bodies[e] = BODIES[spec.bodies]
  Barrier.shots[e] = spec.shots ? 1 : 0
  Barrier.reflect[e] = spec.reflect ? 1 : 0
  Barrier.of[e] = spec.follow
  Barrier.ofUid[e] = spec.follow >= 0 ? Uid.v[spec.follow]! : 0
  Barrier.color[e] = spec.color
  barrierSrc[e] = spec.src
  barrierCross[e] = spec.onCross
  if (spec.onCross) barrierSide[e] = new Map()
  return e
}

/** 这面墙对这个阵营是不是敌方的墙 */
export function hostileTo(e: number, faction: number): boolean {
  const own = Faction.v[e]!
  return own !== faction && own !== FACTION.world
}

function blocksBody(e: number, eid: number): boolean {
  const b = Barrier.bodies[e]!
  return b === 2 || (b === 1 && hostileTo(e, Faction.v[eid]!))
}

/** 点在墙的哪一边：圈内 1、圈外 2；一段墙的左 1 右 2，不在墙的跨度内 0 */
export function sideOf(sim: Sim, e: number, x: number, y: number): number {
  if (Barrier.shape[e] === 1) {
    const d = sim.hooks.worldDelta(sim, Barrier.cx[e]!, Barrier.cy[e]!, x, y)
    return d.x * d.x + d.y * d.y < Barrier.r[e]! * Barrier.r[e]! ? 1 : 2
  }
  const ax = Barrier.ax[e]!
  const ay = Barrier.ay[e]!
  const abx = Barrier.bx[e]! - ax
  const aby = Barrier.by[e]! - ay
  const d = sim.hooks.worldDelta(sim, ax, ay, x, y)
  const l2 = abx * abx + aby * aby
  const t = l2 > 0 ? (d.x * abx + d.y * aby) / l2 : 0
  if (t < 0 || t > 1) return 0
  return abx * d.y - aby * d.x >= 0 ? 1 : 2
}

/** 身体被墙挡住：一段墙按来的那一边推开，圈把里面的留在里面、外面的留在外面 */
function separate(sim: Sim, e: number, from: Point, p: Point, r: number): Point {
  const h = Barrier.thick[e]! + r
  if (Barrier.shape[e] === 1) {
    const cx = Barrier.cx[e]!
    const cy = Barrier.cy[e]!
    const R = Barrier.r[e]!
    const f = sim.hooks.worldDelta(sim, cx, cy, from.x, from.y)
    const d = sim.hooks.worldDelta(sim, cx, cy, p.x, p.y)
    const dist = Math.hypot(d.x, d.y)
    const wasIn = Math.hypot(f.x, f.y) < R
    const ux = dist > 1e-6 ? d.x / dist : 1
    const uy = dist > 1e-6 ? d.y / dist : 0
    if (wasIn && dist > R - h) {
      const k = Math.max(0, R - h)
      return { x: cx + ux * k, y: cy + uy * k }
    }
    if (!wasIn && dist < R + h) return { x: cx + ux * (R + h), y: cy + uy * (R + h) }
    return p
  }
  const ax = Barrier.ax[e]!
  const ay = Barrier.ay[e]!
  const abx = Barrier.bx[e]! - ax
  const aby = Barrier.by[e]! - ay
  const l2 = abx * abx + aby * aby
  const d = sim.hooks.worldDelta(sim, ax, ay, p.x, p.y)
  const t = l2 > 0 ? Math.max(0, Math.min(1, (d.x * abx + d.y * aby) / l2)) : 0
  const qx = abx * t
  const qy = aby * t
  const ox = d.x - qx
  const oy = d.y - qy
  const dist = Math.hypot(ox, oy)
  if (dist >= h) return p
  const len = Math.sqrt(l2) || 1
  let nx = -aby / len
  let ny = abx / len
  const f = sim.hooks.worldDelta(sim, ax, ay, from.x, from.y)
  const side = nx * f.x + ny * f.y
  if (t > 0 && t < 1) {
    const s = side !== 0 ? Math.sign(side) : Math.sign(nx * ox + ny * oy) || 1
    return { x: ax + qx + nx * s * h, y: ay + qy + ny * s * h }
  }
  if (dist > 1e-6) {
    nx = ox / dist
    ny = oy / dist
  }
  return { x: ax + qx + nx * h, y: ay + qy + ny * h }
}

/** 所有挡身体的墙对这个身体的位置修正 */
export function blockBody(sim: Sim, eid: number, from: Point, p: Point): Point {
  if (!hasComponent(sim.world, eid, Hp) || hasComponent(sim.world, eid, Phasing)) return p
  let q = p
  for (const e of query(sim.world, [Barrier])) {
    if (!blocksBody(e, eid)) continue
    q = separate(sim, e, from, q, Radius.v[eid]!)
  }
  return q
}

/** 墙的时钟：跟着主人走、到时消失、敌方身体越过时结算 */
export function tickBarriers(sim: Sim): void {
  const now = sim.elapsedMs
  for (const e of [...query(sim.world, [Barrier])]) {
    const of = Barrier.of[e]!
    const lost = Barrier.ofUid[e] !== 0 && (!isSameEntity(sim.world, of, Barrier.ofUid[e]!) || !Alive.v[of])
    if (now >= Barrier.until[e]! || lost) {
      removeEntity(sim.world, e)
      continue
    }
    if (Barrier.ofUid[e] !== 0) {
      const dx = Transform.x[of]! - Barrier.cx[e]!
      const dy = Transform.y[of]! - Barrier.cy[e]!
      Barrier.cx[e] = Transform.x[of]!
      Barrier.cy[e] = Transform.y[of]!
      Barrier.ax[e] = Barrier.ax[e]! + dx
      Barrier.ay[e] = Barrier.ay[e]! + dy
      Barrier.bx[e] = Barrier.bx[e]! + dx
      Barrier.by[e] = Barrier.by[e]! + dy
    }
    const cross = barrierCross[e]
    const sides = barrierSide[e]
    const src = barrierSrc[e]
    if (!cross || !sides || !src) continue
    for (const list of sim.targets) {
      for (const t of list) {
        if (!t.alive || Uid.v[t.eid] !== t.uid || !hostileTo(e, Faction.v[t.eid]!)) continue
        const side = sideOf(sim, e, Transform.x[t.eid]!, Transform.y[t.eid]!)
        const was = sides.get(t.uid)
        if (side !== 0) sides.set(t.uid, side)
        if (was === undefined || side === 0 || was === side) continue
        applyAbilityEffects(sim, src, cross, { x: Transform.x[t.eid]!, y: Transform.y[t.eid]!, baseDamage: 0, targets: [t.eid] })
      }
    }
  }
}

/** 一段飞行轨迹是否穿过这面墙；穿过时返回反弹用的法向，否则 null */
export function crossing(sim: Sim, e: number, x0: number, y0: number, x1: number, y1: number): Point | null {
  if (Barrier.shape[e] === 1) {
    const cx = Barrier.cx[e]!
    const cy = Barrier.cy[e]!
    const R = Barrier.r[e]!
    const d0 = sim.hooks.worldDelta(sim, cx, cy, x0, y0)
    const d1 = { x: d0.x + (x1 - x0), y: d0.y + (y1 - y0) }
    const in0 = d0.x * d0.x + d0.y * d0.y < R * R
    const in1 = d1.x * d1.x + d1.y * d1.y < R * R
    if (in0 === in1) return null
    const len = Math.hypot(d0.x, d0.y) || 1
    return { x: d0.x / len, y: d0.y / len }
  }
  const ax = Barrier.ax[e]!
  const ay = Barrier.ay[e]!
  const abx = Barrier.bx[e]! - ax
  const aby = Barrier.by[e]! - ay
  const d0 = sim.hooks.worldDelta(sim, ax, ay, x0, y0)
  const d1 = { x: d0.x + (x1 - x0), y: d0.y + (y1 - y0) }
  const c0 = abx * d0.y - aby * d0.x
  const c1 = abx * d1.y - aby * d1.x
  if ((c0 > 0) === (c1 > 0)) return null
  const k = c0 / (c0 - c1)
  const hx = d0.x + (d1.x - d0.x) * k
  const hy = d0.y + (d1.y - d0.y) * k
  const l2 = abx * abx + aby * aby
  const t = l2 > 0 ? (hx * abx + hy * aby) / l2 : -1
  if (t < 0 || t > 1) return null
  const len = Math.sqrt(l2)
  return { x: -aby / len, y: abx / len }
}
