import { hasComponent, query } from 'bitecs'
import { Barrier, Faction, Homing, Linger, PrevPos, Proj, PROJ_SET, Radius, Tint, Transform, Vel, VisOff } from '../components'
import { projHitUids, projSrc, barrierSrc } from '../store'
import { crossing } from '../entities/barrier'
import { cullProjectile } from './shared/projectile'
import { isSameEntity } from '../utils/identity'
import { nearestTarget } from '../utils/targets'
import { flying, WORLD_SOURCE } from '../utils/source'
import { boltProbe, boltZ, boltZAt, breachAt, CHEST_M, impactAt, shotPass } from '../utils/pass'
import { flatSource } from '../entities/projectile'
import { ballistic } from './shared/body'
import { LIFT_PER_M } from '../../util/units'
import type { BodyStep } from './shared/body'
import type { Sim } from '../sim'

const REFLECT_LIFE_MS = 1400
const FLIGHT: BodyStep = { x: 0, y: 0, vx: 0, vy: 0 }

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

/** 召回中的弹体沿最近的直路飞向主人，到了就收起；主人没了就消失 */
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

/** 会反弹的技能墙把弹体弹回去并归自己 */
function reflect(sim: Sim, eid: number, b: number, x0: number, y0: number, x1: number, y1: number): void {
  const n = crossing(sim, b, x0, y0, x1, y1) ?? { x: -Vel.x[eid]!, y: -Vel.y[eid]! }
  const nl = Math.hypot(n.x, n.y) || 1
  const nx = n.x / nl
  const ny = n.y / nl
  const vx = Vel.x[eid]!
  const vy = Vel.y[eid]!
  const dot = vx * nx + vy * ny
  Vel.x[eid] = vx - 2 * dot * nx
  Vel.y[eid] = vy - 2 * dot * ny
  Transform.x[eid] = x0
  Transform.y[eid] = y0
  Faction.v[eid] = Faction.v[b]!
  const src = barrierSrc[b]
  if (src) projSrc[eid] = Proj.arc[eid]! > 0 ? flying(src) : flatSource(flying(src), Proj.z[eid]!)
  projHitUids[eid] = new Set()
  Proj.dieAt[eid] = sim.elapsedMs + REFLECT_LIFE_MS
  Tint.color[eid] = Barrier.color[b]!
}

/**
 * 弹体飞行：追踪弹转向、召回的飞向主人、落地的不动，飞行中受引力加速；这一步的轨迹先截在第一个挡住它的障碍上（地图的按高度与贯穿，敌方的技能墙一律挡），
 * 截下的这一段照常判命中，判完就消失（会落地的落在那里），撞上时带着的破坏力打在障碍上；会反弹的技能墙把它弹回去。抛射的按飞了多远抬高，抛到地方落地
 */
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
    const g = sim.hooks.pull(sim, ax, ay)
    let stepX = Vel.x[eid]! * dt
    let stepY = Vel.y[eid]! * dt
    if (g.x !== 0 || g.y !== 0) {
      ballistic(sim, FLIGHT, ax, ay, Vel.x[eid]!, Vel.y[eid]!, g, dt)
      Vel.x[eid] = FLIGHT.vx
      Vel.y[eid] = FLIGHT.vy
      stepX = FLIGHT.x - ax
      stepY = FLIGHT.y - ay
      if (Proj.spin[eid] === 0 && (FLIGHT.vx !== 0 || FLIGHT.vy !== 0)) Transform.rot[eid] = Math.atan2(Vel.y[eid]!, Vel.x[eid]!) + Proj.rotOffset[eid]!
    }
    let len = Math.hypot(stepX, stepY)
    if (!Proj.through[eid] && len > 0) {
      const p = shotPass(sim, Faction.v[eid]!, boltProbe(eid, len), ax, ay, ax + stepX, ay + stepY)
      const b = p.block
      if (b && b.barrier >= 0 && Barrier.reflect[b.barrier]) {
        reflect(sim, eid, b.barrier, ax, ay, ax + stepX, ay + stepY)
        PrevPos.x[eid] = ax
        PrevPos.y[eid] = ay
        continue
      }
      Proj.pierce[eid] = Proj.pierce[eid]! - p.spent
      if (b) {
        stepX *= b.t
        stepY *= b.t
        len *= b.t
        Proj.dieAt[eid] = sim.elapsedMs
        impactAt(sim, b)
        breachAt(sim, b.x, b.y, boltZAt(eid, Proj.flown[eid]! + len), Proj.radius[eid]!, Proj.breach[eid]!)
      }
    }
    const moved = sim.hooks.wrap(sim, ax + stepX, ay + stepY)
    Transform.x[eid] = moved.x
    Transform.y[eid] = moved.y
    PrevPos.x[eid] = moved.x - stepX
    PrevPos.y[eid] = moved.y - stepY
    Proj.flown[eid] = Proj.flown[eid]! + len
    // 抛射在画面上按高出齐胸多少抬起
    if (Proj.arc[eid]! > 0) VisOff.y[eid] = -Math.max(0, boltZ(eid) - CHEST_M) * LIFT_PER_M
    if (Proj.spin[eid] !== 0) Transform.rot[eid] = Transform.rot[eid]! + Proj.spin[eid]! * dt
    else if (hasComponent(sim.world, eid, Homing) || hasComponent(sim.world, eid, Linger)) Transform.rot[eid] = Math.atan2(Vel.y[eid]!, Vel.x[eid]!) + Proj.rotOffset[eid]!
  }
}
