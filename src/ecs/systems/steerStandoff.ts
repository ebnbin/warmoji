import { query } from 'bitecs'
import { AI } from '../../data/enemies'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { BVel, Slowed, Speed, Standoff, Steering, Transform } from '../components'
import { nearestAlive, wanderDir } from './shared/steer'
import type { Sim } from '../sim'

export function steerStandoff(sim: Sim): void {
  const band = AI.standoffBandU * UNIT
  for (const eid of query(sim.world, [Standoff, Steering, Transform, Speed])) {
    if (!Steering.v[eid]) continue
    const sp = Speed.v[eid]! * Slowed.v[eid]!
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    const target = nearestAlive(sim, eid, ex, ey)
    const dx = target ? target.x - ex : 0
    const dy = target ? target.y - ey : 0
    const dist = target ? Math.hypot(dx, dy) : Infinity
    if (dist > Standoff.detectRange[eid]!) {
      const d = wanderDir(sim, eid)
      BVel.x[eid] = d.x * sp * 0.5
      BVel.y[eid] = d.y * sp * 0.5
      continue
    }
    const stand = Standoff.standoffDist[eid]!
    if (dist > stand + band) {
      const d = norm(dx, dy)
      BVel.x[eid] = d.x * sp
      BVel.y[eid] = d.y * sp
      continue
    }
    if (dist < stand - band) {
      const away = norm(-dx, -dy)
      const d = sim.hooks.fleeDir(sim, eid, away.x, away.y)
      BVel.x[eid] = d.x * sp
      BVel.y[eid] = d.y * sp
      continue
    }
  }
}
