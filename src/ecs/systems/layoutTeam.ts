import { UNIT } from '../../util/units'
import { SQUAD } from '../../data/feel'
import { TEAM } from '../../data/characters'
import { fanSlots } from '../../data/formation'
import { Alive, Ctl, Drive, Phys, Seat, SpeedMul, Transform } from '../components'
import type { Sim } from '../sim'
import type { Point } from '../../util/vec'
import { leaderX, leaderY } from '../utils/team'
import { fanDistance, fanSpreadDeg, recallDist, reverseGain, seatHysteresis, turnRate } from './shared/squad'

const HEADING_MIN = 0.5

/** 在空位里挑离自己最近的；只有近出滞后量才换，当前位已被别人占了则必须换 */
function pickSeat(sim: Sim, eid: number, seats: readonly Point[], free: (i: number) => boolean): number {
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  const distTo = (s: Point): number => {
    const d = sim.hooks.worldDelta(sim, x, y, s.x, s.y)
    return Math.hypot(d.x, d.y)
  }
  let best = -1
  let bestD = Infinity
  seats.forEach((s, i) => {
    if (!free(i)) return
    const d = distTo(s)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  const cur = Seat.v[eid]!
  if (cur >= 0 && cur < seats.length && free(cur) && distTo(seats[cur]!) <= bestD + seatHysteresis() * UNIT) return cur
  return best
}

/** 朝向按限速转向队长的运动方向，目标位扇形随之沿弧线转动而不是瞬移 */
function turnHeading(sim: Sim, tx: number, ty: number, dt: number): void {
  const cur = Math.atan2(sim.heading.y, sim.heading.x)
  const raw = Math.atan2(ty, tx) - cur
  const diff = Math.atan2(Math.sin(raw), Math.cos(raw))
  const max = (turnRate() * Math.PI * dt) / 180
  const step = Math.abs(diff) <= max ? diff : (diff < 0 ? -1 : 1) * max
  sim.heading = { x: Math.cos(cur + step), y: Math.sin(cur + step) }
}

/** 队员的驱动指向队长身后扇形上的目标位；进占位半径即占位、同位取最近，阵亡者停靠后紧跟；这一帧不能自己走时不动 */
export function layoutTeam(sim: Sim): void {
  const dt = Math.min(sim.dtMs, 50) / 1000
  const leader = sim.leader
  const cx = leaderX(sim)
  const cy = leaderY(sim)
  const medium = sim.hooks.mediumVelocity(sim, cx, cy)
  const hx = Phys.vx[leader]! - medium.x
  const hy = Phys.vy[leader]! - medium.y
  const speed = Math.hypot(hx, hy)
  if (speed > HEADING_MIN * UNIT) turnHeading(sim, hx / speed, hy / speed, dt)
  const followers = sim.characters.filter((e) => e !== leader)
  // 目标位本身也受场地约束：贴墙时缩到可达处，否则队员永远到不了、也占不上
  const seats = fanSlots(followers.length, fanDistance(), fanSpreadDeg(), sim.heading.x, sim.heading.y).map((o) =>
    sim.hooks.constrainBody(sim, leader, { x: cx, y: cy }, { x: cx + o.x, y: cy + o.y }),
  )
  const seatR = SQUAD.seatRadius * UNIT
  const distToSeat = (f: number, i: number): number => {
    const d = sim.hooks.worldDelta(sim, Transform.x[f]!, Transform.y[f]!, seats[i]!.x, seats[i]!.y)
    return Math.hypot(d.x, d.y)
  }
  const claimR = SQUAD.claimRadius * UNIT
  const claims: { f: number; s: number; d: number }[] = []
  for (const f of followers) {
    const dead = Alive.v[f] === 0
    if (!dead && Seat.ghost[f]) Seat.ghost[f] = 0
    const s = Seat.v[f]!
    if (s < 0 || s >= seats.length) continue
    if (dead) {
      if (Seat.ghost[f]) claims.push({ f, s, d: -1 })
      continue
    }
    const d = distToSeat(f, s)
    if (d <= claimR) claims.push({ f, s, d })
  }
  claims.sort((a, b) => a.d - b.d)
  const occupant: number[] = seats.map(() => -1)
  for (const c of claims) if (occupant[c.s]! < 0) occupant[c.s] = c.f
  // 刚阵亡的当帧就预订最近的空位，归位途中不再换位，别人也不再挑它
  for (const f of followers) {
    if (Alive.v[f] || Seat.ghost[f]) continue
    const s = pickSeat(sim, f, seats, (i) => occupant[i]! < 0)
    Seat.v[f] = s
    Seat.ghost[f] = 1
    occupant[s] = f
  }
  for (const f of followers) {
    if (!Alive.v[f] || occupant[Seat.v[f]!] === f) continue
    Seat.v[f] = pickSeat(sim, f, seats, (i) => occupant[i]! < 0)
  }
  const recall = recallDist() > 0 ? recallDist() * UNIT : Infinity
  for (const f of followers) {
    if (!Alive.v[f]) continue
    Phys.grip[f] = TEAM.followerGrip
    Drive.x[f] = 0
    Drive.y[f] = 0
    if (!Ctl.move[f]) continue
    const seat = seats[Seat.v[f]!]!
    const x = Transform.x[f]!
    const y = Transform.y[f]!
    const away = sim.hooks.worldDelta(sim, x, y, cx, cy)
    if (Math.hypot(away.x, away.y) > recall) {
      Transform.x[f] = seat.x
      Transform.y[f] = seat.y
      Phys.vx[f] = 0
      Phys.vy[f] = 0
      continue
    }
    const d = sim.hooks.worldDelta(sim, x, y, seat.x, seat.y)
    const dist = Math.hypot(d.x, d.y)
    if (dist <= seatR) continue
    const nx = d.x / dist
    const ny = d.y / dist
    const gain = Phys.vx[f]! * nx + Phys.vy[f]! * ny < 0 ? reverseGain() : 1
    const want = (Phys.thrust[f]! / Phys.drag[f]!) * SpeedMul.v[f]! * gain
    Drive.x[f] = nx * want
    Drive.y[f] = ny * want
  }
  const ghostStep = SQUAD.ghostSpeed * UNIT * dt
  for (const f of followers) {
    if (Alive.v[f]) continue
    const seat = seats[Seat.v[f]!]!
    Phys.vx[f] = 0
    Phys.vy[f] = 0
    if (Seat.ghost[f] !== 2) {
      const d = sim.hooks.worldDelta(sim, Transform.x[f]!, Transform.y[f]!, seat.x, seat.y)
      const dist = Math.hypot(d.x, d.y)
      if (dist > seatR && dist > ghostStep) {
        const p = sim.hooks.wrap(sim, Transform.x[f]! + (d.x / dist) * ghostStep, Transform.y[f]! + (d.y / dist) * ghostStep)
        Transform.x[f] = p.x
        Transform.y[f] = p.y
        continue
      }
      Seat.ghost[f] = 2
    }
    Transform.x[f] = seat.x
    Transform.y[f] = seat.y
  }
}
