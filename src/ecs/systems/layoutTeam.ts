import { UNIT } from '../../util/units'
import { FOLLOW, PURSUIT, WANDER } from '../../data/feel'
import { formationPosts } from '../../data/formation'
import { Alive, Depth, Follow, MoveSpeed, Orbit, Threat, Transform, VisOff, Wander } from '../components'
import type { Sim } from '../sim'
import { centerX, centerY } from '../utils/team'
import { pursuitCatchUp, pursuitLeash, pursuitOn, separationOn } from './shared/pursuit'

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

/** 队员用自己的移速跑向队形位：离队长太远改为直奔队长并加速，远到屏幕外则直接拉回 */
function pursue(sim: Sim, eid: number, tx: number, ty: number, dt: number): void {
  const fx = Follow.x[eid]!
  const fy = Follow.y[eid]!
  const toLeader = sim.hooks.worldDelta(sim, fx, fy, centerX(sim), centerY(sim))
  const away = Math.hypot(toLeader.x, toLeader.y)
  if (away > PURSUIT.snapDist * UNIT) {
    Follow.x[eid] = tx
    Follow.y[eid] = ty
    Follow.vx[eid] = 0
    Follow.vy[eid] = 0
    return
  }
  const chasing = away > pursuitLeash() * UNIT
  const dx = (chasing ? fx + toLeader.x : tx) - fx
  const dy = (chasing ? fy + toLeader.y : ty) - fy
  const d = Math.hypot(dx, dy)
  const arrive = PURSUIT.arriveRadius * UNIT
  if (d <= arrive || dt <= 0) {
    Follow.vx[eid] = 0
    Follow.vy[eid] = 0
    return
  }
  const slow = PURSUIT.slowRadius * UNIT
  const ease = d >= slow ? 1 : Math.max(PURSUIT.easeFloor, (d - arrive) / (slow - arrive))
  const speed = MoveSpeed.v[eid]! * sim.battleFx.moveSpeedMul * (chasing ? pursuitCatchUp() : 1) * ease
  const step = Math.min(d - arrive, speed * dt)
  const vx = (dx / d) * (step / dt)
  const vy = (dy / d) * (step / dt)
  Follow.x[eid] = fx + vx * dt
  Follow.y[eid] = fy + vy * dt
  Follow.vx[eid] = vx
  Follow.vy[eid] = vy
}

/** 重叠的队员互相推开；队长不推人也不被推，否则会拖着撞上的队员跑 */
function separate(sim: Sim): void {
  const minD = PURSUIT.separation * UNIT
  for (const a of sim.characters) {
    if (!Alive.v[a] || a === sim.leader) continue
    for (const b of sim.characters) {
      if (b === a || b === sim.leader || !Alive.v[b]) continue
      const d = sim.hooks.worldDelta(sim, Follow.x[a]!, Follow.y[a]!, Follow.x[b]!, Follow.y[b]!)
      const dist = Math.hypot(d.x, d.y)
      if (dist >= minD) continue
      const push = (minD - dist) * 0.5
      const nx = dist > 1e-3 ? d.x / dist : 1
      const ny = dist > 1e-3 ? d.y / dist : 0
      Follow.x[a] = Follow.x[a]! - nx * push
      Follow.y[a] = Follow.y[a]! - ny * push
    }
  }
}

export function layoutTeam(sim: Sim): void {
  const delta = sim.dtMs
  const posts = formationPosts(sim.formation, sim.count, Orbit.phase[sim.captain]!)
  const moving = sim.teamDir.x !== 0 || sim.teamDir.y !== 0
  const dt = Math.min(delta, 50) / 1000
  const tSec = sim.elapsedMs / 1000
  sim.pursuit = sim.leader >= 0 && pursuitOn()
  for (let slot = 0; slot < sim.characters.length; slot++) {
    const eid = sim.characters[slot]!
    const idx = sim.postBySlot[slot] ?? slot
    const p = posts[idx] ?? { x: 0, y: 0 }
    const lead = eid === sim.leader
    const wanderOn = Alive.v[eid]! && !moving && !Threat.v[eid] && !lead
    let amp = Wander.amp[eid]!
    amp += ((wanderOn ? 1 : 0) - amp) * Math.min(1, delta / WANDER.rampMs)
    Wander.amp[eid] = amp
    const wander = amp * WANDER.radius
    const seed = Wander.seed[eid]!
    const rawX = centerX(sim) + p.x + Math.sin(tSec * WANDER.freqX + seed) * wander
    const rawY = centerY(sim) + p.y + Math.sin(tSec * WANDER.freqY + seed * 2.3) * wander
    const td = sim.hooks.worldDelta(sim, Follow.x[eid]!, Follow.y[eid]!, rawX, rawY)
    const tx = Follow.x[eid]! + td.x
    const ty = Follow.y[eid]! + td.y
    if (lead) {
      Follow.x[eid] = tx
      Follow.y[eid] = ty
      Follow.vx[eid] = 0
      Follow.vy[eid] = 0
    } else if (sim.pursuit && Alive.v[eid]) {
      pursue(sim, eid, tx, ty, dt)
    } else {
      spring(eid, tx, ty, dt)
    }
  }
  if (sim.pursuit && separationOn()) separate(sim)
  for (const eid of sim.characters) {
    const wrapped = sim.hooks.wrap(sim, Follow.x[eid]!, Follow.y[eid]!)
    Follow.x[eid] = wrapped.x
    Follow.y[eid] = wrapped.y
    Transform.x[eid] = wrapped.x + VisOff.x[eid]!
    Transform.y[eid] = wrapped.y + VisOff.y[eid]!
    Depth.z[eid] = 10 + sim.hooks.worldDelta(sim, centerX(sim), centerY(sim), wrapped.x, wrapped.y).y / UNIT
  }
}
