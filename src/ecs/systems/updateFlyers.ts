import { query } from 'bitecs'
import { catchFlyer } from '../entities/weapon'
import { DEG2RAD } from '../../util/units'
import { Flyer, FlyerShape, Frozen, Payload, Transform, Uid } from '../components'
import { abilityOnHit, flyerHits } from '../store'
import { ownerX, ownerY } from '../utils/amp'
import { hit } from './shared/damage'
import { applyOnHit } from './shared/effects'
import { sourceOf } from '../utils/source'
import { targetsNear } from '../utils/targets'
import type { Sim } from '../sim'

/** 飞返体：去程沿直线缓动到射程尽头，回程追着持有者；去程回程各打每个身体一次 */
export function updateFlyers(sim: Sim): void {
  const dt = sim.wdtMs
  for (const f of [...query(sim.world, [Flyer, Transform])]) {
    const e = Flyer.of[f]!
    if (Frozen.v[e]) {
      catchFlyer(sim, e, f)
      continue
    }
    Transform.rot[f] = Transform.rot[f]! + (FlyerShape.spinDegPerSec[e]! * DEG2RAD * dt) / 1000
    if (Flyer.phase[f] === 0) {
      Flyer.t[f] = Math.min(1, Flyer.t[f]! + dt / FlyerShape.outMs[e]!)
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
      const step = (FlyerShape.returnSpeed[e]! * dt) / 1000
      if (dist <= Math.max(step, 20)) {
        catchFlyer(sim, e, f)
        continue
      }
      const p = sim.hooks.wrap(sim, Transform.x[f]! + (d.x / dist) * step, Transform.y[f]! + (d.y / dist) * step)
      Transform.x[f] = p.x
      Transform.y[f] = p.y
    }
    const magnet = FlyerShape.coinMagnet[e]!
    if (magnet > 0) sim.frameAttractors.push({ x: Transform.x[f]!, y: Transform.y[f]!, r2: magnet * magnet })
    const struck = flyerHits[f]!
    const src = sourceOf(sim, e)
    const radius = FlyerShape.radius[e]!
    for (const t of targetsNear(sim, src, Transform.x[f]!, Transform.y[f]!, radius)) {
      if (struck.has(Uid.v[t.eid]!)) continue
      const dx = t.x - Transform.x[f]!
      const dy = t.y - Transform.y[f]!
      const rr = radius + t.radius
      if (dx * dx + dy * dy > rr * rr) continue
      struck.add(Uid.v[t.eid]!)
      const fx = Transform.x[f]!
      const fy = Transform.y[f]!
      const damage = Flyer.damage[f]!
      if (hit(sim, src, t.eid, damage, { knockback: Payload.knockback[e]!, from: { x: fx, y: fy } })) applyOnHit(sim, src, abilityOnHit[e], fx, fy, damage, [t.eid])
    }
  }
}
