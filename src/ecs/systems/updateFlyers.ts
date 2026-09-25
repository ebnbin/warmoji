import { hasComponent, query } from 'bitecs'
import { catchFlyer } from '../entities/weapon'
import { DEG2RAD } from '../../util/units'
import { Boomerang, CoinMagnet, Flyer, Frozen, Thrown, Transform, Uid } from '../components'
import { flyerHits } from '../store'
import { cooldownMul, ownerX, ownerY } from '../utils/amp'
import { damageTarget } from './shared/damage'
import { sourceOf } from '../utils/source'
import { targetsNear } from '../utils/targets'
import type { Sim } from '../sim'

export function updateFlyers(sim: Sim): void {
  const dt = sim.wdtMs
  for (const f of [...query(sim.world, [Flyer, Transform])]) {
    const e = Flyer.of[f]!
    if (Frozen.v[e]) {
      catchFlyer(sim, e, f)
      Boomerang.cdLeft[e] = Boomerang.cdBase[e]!
      continue
    }
    Transform.rot[f] = Transform.rot[f]! + (Boomerang.spinDegPerSec[e]! * DEG2RAD * dt) / 1000
    if (Flyer.phase[f] === 0) {
      Flyer.t[f] = Math.min(1, Flyer.t[f]! + dt / Boomerang.outMs[e]!)
      const ease = Math.sin((Flyer.t[f]! * Math.PI) / 2)
      Transform.x[f] = Flyer.launchX[f]! + (Flyer.destX[f]! - Flyer.launchX[f]!) * ease
      Transform.y[f] = Flyer.launchY[f]! + (Flyer.destY[f]! - Flyer.launchY[f]!) * ease
      if (Flyer.t[f]! >= 1) {
        Flyer.phase[f] = 1
        flyerHits[f]!.clear()
      }
    } else {
      const d = sim.hooks.worldDelta(sim, Transform.x[f]!, Transform.y[f]!, ownerX(e), ownerY(e))
      const dist = Math.hypot(d.x, d.y)
      const step = (Boomerang.returnSpeed[e]! * dt) / 1000
      if (dist <= Math.max(step, 20)) {
        catchFlyer(sim, e, f)
        if (Thrown.n[e] === 0) Boomerang.cdLeft[e] = Boomerang.cdBase[e]! * cooldownMul(sim, e)
        continue
      }
      const p = sim.hooks.wrap(sim, Transform.x[f]! + (d.x / dist) * step, Transform.y[f]! + (d.y / dist) * step)
      Transform.x[f] = p.x
      Transform.y[f] = p.y
    }
    if (hasComponent(sim.world, e, CoinMagnet)) {
      const r = CoinMagnet.radius[e]!
      sim.frameAttractors.push({ x: Transform.x[f]!, y: Transform.y[f]!, r2: r * r })
    }
    const hits = flyerHits[f]!
    const src = sourceOf(sim, e)
    for (const t of targetsNear(sim, src, Transform.x[f]!, Transform.y[f]!, Boomerang.hitRadius[e]!)) {
      if (hits.has(Uid.v[t.eid]!)) continue
      const dx = t.x - Transform.x[f]!
      const dy = t.y - Transform.y[f]!
      const rr = Boomerang.hitRadius[e]! + t.radius
      if (dx * dx + dy * dy > rr * rr) continue
      hits.add(Uid.v[t.eid]!)
      damageTarget(sim, src, t.eid, Flyer.damage[f]!, Boomerang.knockback[e]!, Transform.x[f]!, Transform.y[f]!)
    }
  }
}
