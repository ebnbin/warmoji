import { query } from 'bitecs'
import { BVel, Chase, Slowed, Speed, Steering, Transform } from '../components'
import { nearestAlive } from './shared/steer'
import type { Sim } from '../sim'

/** 直扑最近的活着队员（方向经世界钩子——残垣图走流场绕墙） */
export function steerChase(sim: Sim): void {
  for (const eid of query(sim.world, [Chase, Steering, Transform, Speed])) {
    if (!Steering.v[eid]) continue
    const target = nearestAlive(sim, Transform.x[eid]!, Transform.y[eid]!)
    if (!target) continue
    const speed = Speed.v[eid]! * Slowed.v[eid]!
    const dir = sim.hooks.chaseDir(sim, eid, target.x, target.y)
    BVel.x[eid] = dir.x * speed
    BVel.y[eid] = dir.y * speed
  }
}
