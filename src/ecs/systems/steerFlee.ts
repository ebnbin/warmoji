import { query } from 'bitecs'
import { AI } from '../../data/enemies'
import { norm } from '../../util/vec'
import { Drive, Flee, Slowed, Speed, Steering, Transform } from '../components'
import { nearestFoe, wanderDir } from './shared/steer'
import type { Sim } from '../sim'

export function steerFlee(sim: Sim): void {
  for (const eid of query(sim.world, [Flee, Steering, Transform, Speed])) {
    if (!Steering.v[eid]) continue
    const speed = Speed.v[eid]!
    const slow = Slowed.v[eid]!
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    const target = nearestFoe(sim, eid, ex, ey)
    if (target) {
      const d = sim.hooks.worldDelta(sim, ex, ey, target.x, target.y)
      const r = Flee.range[eid]!
      if (d.x * d.x + d.y * d.y <= r * r) {
        const away = norm(-d.x, -d.y)
        const dir = sim.hooks.fleeDir(sim, eid, away.x, away.y)
        Drive.x[eid] = dir.x * speed * slow
        Drive.y[eid] = dir.y * speed * slow
        continue
      }
    }
    const w = wanderDir(sim, eid)
    const sp = speed * AI.fleeIdleSpeedMul * slow
    Drive.x[eid] = w.x * sp
    Drive.y[eid] = w.y * sp
  }
}
