import { UNIT } from '../../util/units'
import { FOLLOW, SQUAD, WANDER } from '../../data/feel'
import { fanSlots, formationPosts } from '../../data/formation'
import { Alive, Depth, Follow, Orbit, Phys, Seat, Threat, Transform, VisOff, Wander } from '../components'
import type { Sim } from '../sim'
import type { Point } from '../../util/vec'
import { centerX, centerY } from '../utils/team'
import { settleBody, stepBody } from './shared/body'
import { fanDistance, fanSpreadDeg, physicsOn, recallDist, reverseGain, seatHysteresis, turnRate } from './shared/squad'

const HEADING_MIN = 0.5

function spring(eid: number, tx: number, ty: number, dt: number): void {
  let fx = Follow.x[eid]!
  let fy = Follow.y[eid]!
  let fvx = Follow.vx[eid]!
  let fvy = Follow.vy[eid]!
  if (dt > 0) {
    const k = Follow.k[eid]!
    const c = 2 * Math.sqrt(k) * FOLLOW.zeta
    fvx += (k * (tx - fx) - c * fvx) * dt
    fvy += (k * (ty - fy) - c * fvy) * dt
    fx += fvx * dt
    fy += fvy * dt
  }
  const lagX = tx - fx
  const lagY = ty - fy
  const lag = Math.hypot(lagX, lagY)
  if (lag > FOLLOW.maxLag) {
    const pull = 1 - FOLLOW.maxLag / lag
    fx += lagX * pull
    fy += lagY * pull
  }
  Follow.x[eid] = fx
  Follow.y[eid] = fy
  Follow.vx[eid] = fvx
  Follow.vy[eid] = fvy
}

/** 目标点先按世界几何折算到自己附近，环面上才不会绕远路 */
function nearTarget(sim: Sim, eid: number, x: number, y: number): Point {
  const d = sim.hooks.worldDelta(sim, Follow.x[eid]!, Follow.y[eid]!, x, y)
  return { x: Follow.x[eid]! + d.x, y: Follow.y[eid]! + d.y }
}

function wanderTarget(sim: Sim, eid: number, x: number, y: number, on: boolean): Point {
  let amp = Wander.amp[eid]!
  amp += ((on ? 1 : 0) - amp) * Math.min(1, sim.dtMs / WANDER.rampMs)
  Wander.amp[eid] = amp
  const wander = amp * WANDER.radius
  const seed = Wander.seed[eid]!
  const tSec = sim.elapsedMs / 1000
  return {
    x: x + Math.sin(tSec * WANDER.freqX + seed) * wander,
    y: y + Math.sin(tSec * WANDER.freqY + seed * 2.3) * wander,
  }
}

function commit(sim: Sim): void {
  for (const eid of sim.characters) {
    const wrapped = sim.hooks.wrap(sim, Follow.x[eid]!, Follow.y[eid]!)
    Follow.x[eid] = wrapped.x
    Follow.y[eid] = wrapped.y
    Transform.x[eid] = wrapped.x + VisOff.x[eid]!
    Transform.y[eid] = wrapped.y + VisOff.y[eid]!
    Depth.z[eid] = 10 + sim.hooks.worldDelta(sim, centerX(sim), centerY(sim), wrapped.x, wrapped.y).y / UNIT
  }
}

/** 不满员：环形队形位加弹簧粘合 */
function layoutRing(sim: Sim): void {
  const posts = formationPosts(sim.formation, sim.count, Orbit.phase[sim.captain]!)
  const moving = sim.teamDir.x !== 0 || sim.teamDir.y !== 0
  const dt = Math.min(sim.dtMs, 50) / 1000
  for (let slot = 0; slot < sim.characters.length; slot++) {
    const eid = sim.characters[slot]!
    const idx = sim.postBySlot[slot] ?? slot
    const p = posts[idx] ?? { x: 0, y: 0 }
    const on = Alive.v[eid] === 1 && !moving && !Threat.v[eid]
    const raw = wanderTarget(sim, eid, centerX(sim) + p.x, centerY(sim) + p.y, on)
    const t = nearTarget(sim, eid, raw.x, raw.y)
    spring(eid, t.x, t.y, dt)
  }
  commit(sim)
}

/** 在空位里挑离自己最近的；只有近出滞后量才换，当前位已被别人占了则必须换 */
function pickSeat(sim: Sim, eid: number, seats: readonly Point[], free: (i: number) => boolean): number {
  const x = Follow.x[eid]!
  const y = Follow.y[eid]!
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

/** 满员：队长贴中心，队员用物理跑向身后扇形上的目标位；进占位半径即占位、同位取最近，阵亡者停靠后紧跟 */
function layoutSquad(sim: Sim): void {
  const delta = sim.dtMs
  const dt = Math.min(delta, 50) / 1000
  const leader = sim.leader
  const cx = centerX(sim)
  const cy = centerY(sim)
  Follow.x[leader] = cx
  Follow.y[leader] = cy
  Follow.vx[leader] = 0
  Follow.vy[leader] = 0
  const medium = sim.hooks.mediumVelocity(sim, cx, cy)
  const hx = Phys.vx[leader]! - medium.x
  const hy = Phys.vy[leader]! - medium.y
  const speed = Math.hypot(hx, hy)
  const moving = speed > HEADING_MIN * UNIT
  if (moving) turnHeading(sim, hx / speed, hy / speed, dt)
  const followers = sim.characters.filter((e) => e !== leader)
  // 目标位本身也受场地约束：贴墙时缩到可达处，否则队员永远到不了、也占不上
  const seats = fanSlots(followers.length, fanDistance(), fanSpreadDeg(), sim.heading.x, sim.heading.y).map((o) =>
    sim.hooks.constrainBody(sim, { x: cx, y: cy }, { x: cx + o.x, y: cy + o.y }, delta),
  )
  const seatR = SQUAD.seatRadius * UNIT
  const distToSeat = (f: number, i: number): number => {
    const d = sim.hooks.worldDelta(sim, Follow.x[f]!, Follow.y[f]!, seats[i]!.x, seats[i]!.y)
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
  const alive = followers.filter((e) => Alive.v[e] === 1)
  const physics = physicsOn()
  sim.physics = physics
  if (physics) {
    const recall = recallDist() > 0 ? recallDist() * UNIT : Infinity
    for (const f of alive) {
      const seat = seats[Seat.v[f]!]!
      const from = { x: Follow.x[f]!, y: Follow.y[f]! }
      const away = sim.hooks.worldDelta(sim, from.x, from.y, cx, cy)
      if (Math.hypot(away.x, away.y) > recall) {
        Follow.x[f] = seat.x
        Follow.y[f] = seat.y
        Phys.vx[f] = 0
        Phys.vy[f] = 0
        continue
      }
      const d = sim.hooks.worldDelta(sim, from.x, from.y, seat.x, seat.y)
      const dist = Math.hypot(d.x, d.y)
      let driveX = 0
      let driveY = 0
      if (dist > seatR) {
        const nx = d.x / dist
        const ny = d.y / dist
        const gain = Phys.vx[f]! * nx + Phys.vy[f]! * ny < 0 ? reverseGain() : 1
        const thrust = Phys.thrust[f]! * sim.battleFx.moveSpeedMul * gain
        driveX = nx * thrust
        driveY = ny * thrust
      }
      const next = stepBody(sim, f, from.x, from.y, { driveX, driveY, extraX: 0, extraY: 0 }, 1, dt)
      const to = sim.hooks.constrainBody(sim, from, next, delta)
      settleBody(sim, f, from, to, dt)
      Follow.x[f] = to.x
      Follow.y[f] = to.y
    }
  } else {
    for (const f of alive) {
      const seat = seats[Seat.v[f]!]!
      const raw = wanderTarget(sim, f, seat.x, seat.y, !moving && !Threat.v[f])
      const t = nearTarget(sim, f, raw.x, raw.y)
      spring(f, t.x, t.y, dt)
    }
  }
  const ghostStep = SQUAD.ghostSpeed * UNIT * dt
  for (const f of followers) {
    if (Alive.v[f]) continue
    const seat = seats[Seat.v[f]!]!
    Phys.vx[f] = 0
    Phys.vy[f] = 0
    Follow.vx[f] = 0
    Follow.vy[f] = 0
    if (Seat.ghost[f] !== 2) {
      const d = sim.hooks.worldDelta(sim, Follow.x[f]!, Follow.y[f]!, seat.x, seat.y)
      const dist = Math.hypot(d.x, d.y)
      if (dist > seatR && dist > ghostStep) {
        Follow.x[f] = Follow.x[f]! + (d.x / dist) * ghostStep
        Follow.y[f] = Follow.y[f]! + (d.y / dist) * ghostStep
        continue
      }
      Seat.ghost[f] = 2
    }
    Follow.x[f] = seat.x
    Follow.y[f] = seat.y
  }
  commit(sim)
}

export function layoutTeam(sim: Sim): void {
  if (sim.leader < 0) layoutRing(sim)
  else layoutSquad(sim)
}
