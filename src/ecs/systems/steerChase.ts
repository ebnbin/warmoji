import { query } from 'bitecs'
import { Drive, Chase, Slowed, Speed, Steering, Transform } from '../components'
import { nearestAlive, wanderDir } from './shared/steer'
import type { Sim } from '../sim'

export function steerChase(sim: Sim): void {
  for (const eid of query(sim.world, [Chase, Steering, Transform, Speed])) {
    if (!Steering.v[eid]) continue
    const speed = Speed.v[eid]! * Slowed.v[eid]!
    const target = nearestAlive(sim, eid, Transform.x[eid]!, Transform.y[eid]!)
    if (!target) {
      const d = wanderDir(sim, eid)
      Drive.x[eid] = d.x * speed * 0.5
      Drive.y[eid] = d.y * speed * 0.5
      continue
    }
    const dir = sim.hooks.chaseDir(sim, eid, target.x, target.y)
    Drive.x[eid] = dir.x * speed
    Drive.y[eid] = dir.y * speed
  }
}
