import { UNIT } from '../../util/units'
import { FOLLOW, WANDER } from '../../data/feel'
import { } from '../../data/characters'
import { formationPosts } from '../../data/formation'
import { Alive, Depth, Follow, Orbit, Threat, Transform, VisOff, Wander } from '../components'
import { } from '../utils/ease'
import type { Sim } from '../sim'
import { centerX, centerY } from '../utils/team'

/** 只管人站在哪；纯表现在 animateCharacters */
export function layoutTeam(sim: Sim): void {
  const delta = sim.dtMs
  const posts = formationPosts(sim.formation, sim.count, Orbit.phase[sim.captain]!)
  const moving = sim.teamDir.x !== 0 || sim.teamDir.y !== 0
  const dt = Math.min(delta, 50) / 1000
  const tSec = sim.elapsedMs / 1000
  for (let slot = 0; slot < sim.characters.length; slot++) {
    const eid = sim.characters[slot]!
    const idx = sim.postBySlot[slot] ?? slot
    const p = posts[idx] ?? { x: 0, y: 0 }
    const wanderOn = Alive.v[eid]! && !moving && !Threat.v[eid]
    let amp = Wander.amp[eid]!
    amp += ((wanderOn ? 1 : 0) - amp) * Math.min(1, delta / WANDER.rampMs)
    Wander.amp[eid] = amp
    const wander = amp * WANDER.radius
    const seed = Wander.seed[eid]!
    const rawX = centerX(sim) + p.x + Math.sin(tSec * WANDER.freqX + seed) * wander
    const rawY = centerY(sim) + p.y + Math.sin(tSec * WANDER.freqY + seed * 2.3) * wander
    let fx = Follow.x[eid]!
    let fy = Follow.y[eid]!
    let fvx = Follow.vx[eid]!
    let fvy = Follow.vy[eid]!
    // 目标取离跟随点最近的镜像
    const td = sim.hooks.worldDelta(sim, fx, fy, rawX, rawY)
    const tx = fx + td.x
    const ty = fy + td.y
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
    const wrapped = sim.hooks.wrap(sim, fx, fy)
    fx = wrapped.x
    fy = wrapped.y
    Follow.x[eid] = fx
    Follow.y[eid] = fy
    Follow.vx[eid] = fvx
    Follow.vy[eid] = fvy
    Transform.x[eid] = fx + VisOff.x[eid]!
    Transform.y[eid] = fy + VisOff.y[eid]!
    const guarded = sim.formation === 'guard' && idx === 0
    // 纵深按世界差
    Depth.z[eid] = guarded ? 8.5 : 10 + sim.hooks.worldDelta(sim, centerX(sim), centerY(sim), fx, fy).y / UNIT
  }
}

/** 复活弹入期用弹入缩放覆盖呼吸 */
