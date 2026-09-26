import { hasComponent, query } from 'bitecs'
import { Barrier, Faction, Homing, Linger, PrevPos, Proj, PROJ_SET, Radius, Tint, Transform, Vel } from '../components'
import { projHitUids, projSrc, barrierSrc } from '../store'
import { crossing, hostileTo } from '../entities/barrier'
import { cullProjectile } from './shared/projectile'
import { isSameEntity } from '../utils/identity'
import { nearestTarget } from '../utils/targets'
import { flying, WORLD_SOURCE } from '../utils/source'
import type { Sim } from '../sim'

const REFLECT_LIFE_MS = 1400

/** 追踪弹转向最近的敌人，每秒最多转 Homing.turn */
function steer(sim: Sim, eid: number, dt: number): void {
  const src = projSrc[eid] ?? WORLD_SOURCE
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  const t = nearestTarget(sim, src, x, y, Infinity)
  if (!t) return
  const vx = Vel.x[eid]!
  const vy = Vel.y[eid]!
  const speed = Math.hypot(vx, vy)
  const cur = Math.atan2(vy, vx)
  const want = Math.atan2(t.y - y, t.x - x)
  const diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur))
  const max = Homing.turn[eid]! * dt
  const a = cur + Math.max(-max, Math.min(max, diff))
  Vel.x[eid] = Math.cos(a) * speed
  Vel.y[eid] = Math.sin(a) * speed
}

/** 召回中的弹体飞向主人，到了就收起；主人没了就消失 */
function home(sim: Sim, eid: number): boolean {
  const to = Linger.to[eid]!
  if (!isSameEntity(sim.world, to, Linger.toUid[eid]!)) return false
  const d = sim.hooks.worldDelta(sim, Transform.x[eid]!, Transform.y[eid]!, Transform.x[to]!, Transform.y[to]!)
  const dist = Math.hypot(d.x, d.y)
  if (dist <= Radius.v[to]!) return false
  const sp = Linger.speed[eid]!
  Vel.x[eid] = (d.x / dist) * sp
  Vel.y[eid] = (d.y / dist) * sp
  return true
}

/** 挡弹的墙：敌方弹体穿过就消失，会反弹的墙把它弹回去并归自己 */
function barriers(sim: Sim, eid: number, x0: number, y0: number, x1: number, y1: number): boolean {
  for (const b of query(sim.world, [Barrier])) {
    if (!Barrier.shots[b] || !hostileTo(b, Faction.v[eid]!)) continue
    const n = crossing(sim, b, x0, y0, x1, y1)
    if (!n) continue
    if (!Barrier.reflect[b]) return false
    const vx = Vel.x[eid]!
    const vy = Vel.y[eid]!
    const dot = vx * n.x + vy * n.y
    Vel.x[eid] = vx - 2 * dot * n.x
    Vel.y[eid] = vy - 2 * dot * n.y
    Transform.x[eid] = x0
    Transform.y[eid] = y0
    Faction.v[eid] = Faction.v[b]!
    const src = barrierSrc[b]
    if (src) projSrc[eid] = flying(src)
    projHitUids[eid] = new Set()
    Proj.dieAt[eid] = sim.elapsedMs + REFLECT_LIFE_MS
    Tint.color[eid] = Barrier.color[b]!
    return true
  }
  return true
}

/** 弹体飞行：追踪弹转向、召回的飞向主人、落地的不动，穿过挡弹的墙时消失或被反弹 */
export function moveProjectiles(sim: Sim): void {
  const dt = sim.wdtMs / 1000
  for (const eid of [...query(sim.world, PROJ_SET)]) {
    if (hasComponent(sim.world, eid, Linger)) {
      if (Linger.back[eid] && !home(sim, eid)) {
        cullProjectile(sim, eid)
        continue
      }
      if (!Linger.back[eid] && Linger.until[eid]! > 0) continue
    }
    if (hasComponent(sim.world, eid, Homing)) steer(sim, eid, dt)
    const ax = Transform.x[eid]!
    const ay = Transform.y[eid]!
    const stepX = Vel.x[eid]! * dt
    const stepY = Vel.y[eid]! * dt
    const moved = sim.hooks.wrap(sim, ax + stepX, ay + stepY)
    Transform.x[eid] = moved.x
    Transform.y[eid] = moved.y
    PrevPos.x[eid] = moved.x - stepX
    PrevPos.y[eid] = moved.y - stepY
    if (Proj.spin[eid] !== 0) Transform.rot[eid] = Transform.rot[eid]! + Proj.spin[eid]! * dt
    else if (hasComponent(sim.world, eid, Homing) || hasComponent(sim.world, eid, Linger)) Transform.rot[eid] = Math.atan2(Vel.y[eid]!, Vel.x[eid]!) + Proj.rotOffset[eid]!
    if (!barriers(sim, eid, ax, ay, ax + stepX, ay + stepY)) cullProjectile(sim, eid)
  }
}
