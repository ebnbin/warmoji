import { addComponent, query, removeEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { PICKUP, PICKUPS } from '../../data/pickups'
import { Alive, Bob, Collected, Grab, Hurt, Lifetime, PICKUP_SET, Pull, Tint, Transform, Vel } from '../components'
import { animatePickup } from '../entities/pickup'
import type { Sim } from '../sim'
import { centerX, centerY } from '../utils/team'

const FADE_MS = 250

export function updatePickups(sim: Sim): void {
  const delta = sim.dtMs
  const eids = query(sim.world, PICKUP_SET as unknown as object[])
  if (eids.length === 0) return
  const dt = delta / 1000
  const now = sim.elapsedMs
  const cx = centerX(sim)
  const cy = centerY(sim)
  for (const eid of eids) {
    animatePickup(sim, eid)
    const x = Transform.x[eid]!
    const y = Bob.amp[eid]! > 0 ? Bob.y0[eid]! : Transform.y[eid]!
    if (sim.frameAttractors.length > 0 && Pull.radius[eid]! > 0) {
      let taken = false
      for (const a of sim.frameAttractors) {
        const ad = sim.hooks.worldDelta(sim, x, y, a.x, a.y)
        if (ad.x * ad.x + ad.y * ad.y <= a.r2) {
          take(sim, eid)
          taken = true
          break
        }
      }
      if (taken) continue
    }
    const w = sim.hooks.worldDelta(sim, x, y, cx, cy)
    const dist2 = w.x * w.x + w.y * w.y
    const grab = Grab.radius[eid]!
    if (dist2 <= grab * grab || (Pull.radius[eid]! > 0 && nearAliveCharacter(sim, x, y))) {
      take(sim, eid)
      continue
    }
    if (Lifetime.until[eid]! > 0) {
      const left = Lifetime.until[eid]! - now
      if (left <= 0) {
        removeEntity(sim.world, eid)
        continue
      }
      if (left < FADE_MS) Tint.alpha[eid] = left / FADE_MS
    }
    if (Pull.radius[eid]! === 0) continue
    const idle = sim.hooks.coinIdleVelocity(sim)
    const pull = Pull.radius[eid]!
    if (dist2 < pull * pull) {
      const dir = norm(w.x, w.y)
      Vel.x[eid] = dir.x * PICKUP.magnetSpeed * UNIT + idle.x
      Vel.y[eid] = dir.y * PICKUP.magnetSpeed * UNIT + idle.y
    } else {
      Vel.x[eid] = idle.x
      Vel.y[eid] = idle.y
    }
    const moved = sim.hooks.wrap(sim, x + Vel.x[eid]! * dt, y + Vel.y[eid]! * dt)
    Transform.x[eid] = moved.x
    Transform.y[eid] = moved.y
    if (sim.hooks.cullCoin(sim, moved.x, moved.y)) removeEntity(sim.world, eid)
  }
}

function take(sim: Sim, eid: number): void {
  addComponent(sim.world, eid, Collected)
}

function nearAliveCharacter(sim: Sim, x: number, y: number): boolean {
  const cr = PICKUPS.coin.radius * UNIT
  for (const m of sim.characters) {
    if (!Alive.v[m]) continue
    const rr = Hurt.radius[m]! + cr
    const d = sim.hooks.worldDelta(sim, x, y, Transform.x[m]!, Transform.y[m]!)
    if (d.x * d.x + d.y * d.y <= rr * rr) return true
  }
  return false
}
