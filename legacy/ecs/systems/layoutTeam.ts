import { UNIT } from '../../util/units'
import { SQUAD } from '../../data/feel'
import { TEAM } from '../../data/characters'
import { fanSlots } from '../../data/formation'
import { Alive, Ctl, Drive, Phys, Seat, Transform } from '../components'
import { moveSpeed } from '../utils/stats'
import type { Sim } from '../sim'
import type { Point } from '../../util/vec'
import { leaderX, leaderY } from '../utils/team'
import { fanDistance, fanSpreadDeg, recallDist, reverseGain, seatHysteresis, turnRate } from './shared/squad'
import { dangers, followerGoal } from './shared/instinct'
import { followerInstinct } from '../store'

const HEADING_MIN = 0.5
/** 队员离坑位比这（格）远时按地图的寻路走 */
const NAVIGATE_U = 2

/** 活着的队员，不含队长：倒下的人不跟队，也不占坑位 */
export function followersOf(sim: Sim): number[] {
  return sim.characters.filter((e) => e !== sim.leader && Alive.v[e] === 1)
}

/** 队长身后扇形上的 n 个坑位；坑位本身也受场地约束，贴墙时缩到可达处，否则队员永远到不了、也占不上；落在不该站的地方由地图挪开 */
export function seatPoints(sim: Sim, n: number): Point[] {
  const cx = leaderX(sim)
  const cy = leaderY(sim)
  const from = { x: cx, y: cy }
  return fanSlots(n, fanDistance(), fanSpreadDeg(), sim.heading.x, sim.heading.y).map((o) => {
    const at = sim.hooks.constrainBody(sim, sim.leader, from, { x: cx + o.x, y: cy + o.y })
    return sim.hooks.seat ? sim.hooks.seat(sim, from, at) : at
  })
}

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

/**
 * 队员的驱动指向本能挑的地方，没有就是队长身后扇形上的目标位（远了按地图的寻路绕过障碍），都躲开危险；扇形只给活着的队员留坑；进占位半径即占位、同位取最近；
 * 这一帧不能自己走时不动；离队长的路（地图认得传送门就按穿门的路）太远直接拉回目标位
 */
export function layoutTeam(sim: Sim): void {
  const dt = Math.min(sim.dtMs, 50) / 1000
  const leader = sim.leader
  const cx = leaderX(sim)
  const cy = leaderY(sim)
  const hx = Phys.vx[leader]!
  const hy = Phys.vy[leader]!
  const speed = Math.hypot(hx, hy)
  if (speed > HEADING_MIN * UNIT) turnHeading(sim, hx / speed, hy / speed, dt)
  const followers = followersOf(sim)
  const seats = seatPoints(sim, followers.length)
  const seatR = SQUAD.seatRadius * UNIT
  const distToSeat = (f: number, i: number): number => {
    const d = sim.hooks.worldDelta(sim, Transform.x[f]!, Transform.y[f]!, seats[i]!.x, seats[i]!.y)
    return Math.hypot(d.x, d.y)
  }
  const claimR = SQUAD.claimRadius * UNIT
  const claims: { f: number; s: number; d: number }[] = []
  for (const f of followers) {
    const s = Seat.v[f]!
    if (s < 0 || s >= seats.length) continue
    const d = distToSeat(f, s)
    if (d <= claimR) claims.push({ f, s, d })
  }
  claims.sort((a, b) => a.d - b.d)
  const occupant: number[] = seats.map(() => -1)
  for (const c of claims) if (occupant[c.s]! < 0) occupant[c.s] = c.f
  for (const f of followers) {
    if (occupant[Seat.v[f]!] === f) continue
    Seat.v[f] = pickSeat(sim, f, seats, (i) => occupant[i]! < 0)
  }
  const recall = recallDist() > 0 ? recallDist() * UNIT : Infinity
  const danger = dangers(sim)
  for (const c of sim.characters) followerInstinct[c] = undefined
  for (const f of followers) {
    Phys.grip[f] = TEAM.followerGrip
    if (!Ctl.move[f]) continue
    const seat = seats[Seat.v[f]!]!
    const x = Transform.x[f]!
    const y = Transform.y[f]!
    const away = sim.hooks.worldDelta(sim, x, y, cx, cy)
    if ((sim.hooks.toLeader ? sim.hooks.toLeader(sim, x, y) : Math.hypot(away.x, away.y)) > recall) {
      Transform.x[f] = seat.x
      Transform.y[f] = seat.y
      Phys.vx[f] = 0
      Phys.vy[f] = 0
      continue
    }
    const goal = followerGoal(sim, f, seat, danger)
    followerInstinct[f] = goal.how ?? undefined
    const at = goal.at
    const d = sim.hooks.worldDelta(sim, x, y, at.x, at.y)
    const dist = Math.hypot(d.x, d.y)
    if (dist <= seatR) continue
    // 离要去的地方远了就按地图的寻路走，近了直奔过去
    const way = dist > NAVIGATE_U * UNIT ? sim.hooks.chaseDir(sim, f, at.x, at.y) : { x: d.x / dist, y: d.y / dist }
    const nx = way.x
    const ny = way.y
    const gain = Phys.vx[f]! * nx + Phys.vy[f]! * ny < 0 ? reverseGain() : 1
    const want = moveSpeed(f) * gain
    Drive.x[f] = nx * want
    Drive.y[f] = ny * want
  }
}
