import { query } from 'bitecs'
import { PrevPos, Proj, PROJ_SET, Transform, Vel } from '../components'
import type { Sim } from '../sim'

export function moveProjectiles(sim: Sim): void {
  const dt = sim.wdtMs / 1000
  for (const eid of query(sim.world, PROJ_SET)) {
    const ax = Transform.x[eid]!
    const ay = Transform.y[eid]!
    const stepX = Vel.x[eid]! * dt
    const stepY = Vel.y[eid]! * dt
    const moved = sim.hooks.wrap(sim, ax + stepX, ay + stepY)
    Transform.x[eid] = moved.x
    Transform.y[eid] = moved.y
    PrevPos.x[eid] = moved.x - stepX
    PrevPos.y[eid] = moved.y - stepY
    if (Proj.spin[eid] !== 0) Transform.rot[eid] = Transform.rot[eid]! + Proj.spin[eid]! * dt
  }
}
