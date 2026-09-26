import { query } from 'bitecs'
import { Drive, Roam, Slowed, Speed, Steering } from '../components'
import { wanderDir } from './shared/steer'
import type { Sim } from '../sim'

export function steerRoam(sim: Sim): void {
  for (const eid of query(sim.world, [Roam, Steering, Speed])) {
    if (!Steering.v[eid]) continue
    const d = wanderDir(sim, eid)
    const speed = Speed.v[eid]! * Slowed.v[eid]!
    Drive.x[eid] = d.x * speed
    Drive.y[eid] = d.y * speed
  }
}
