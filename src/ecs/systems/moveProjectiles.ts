import { query } from 'bitecs'
import { PrevPos, Proj, PROJ_SET, Transform, Vel } from '../components'
import type { Sim } from '../sim'

/** 回绕帧 PrevPos 取落点，线段退化成一点，本帧不判命中 */
export function moveProjectiles(sim: Sim): void {
  const dt = sim.wdtMs / 1000
  for (const eid of query(sim.world, PROJ_SET as unknown as object[])) {
    const ax = Transform.x[eid]!
    const ay = Transform.y[eid]!
    const moved = sim.hooks.wrap(sim, ax + Vel.x[eid]! * dt, ay + Vel.y[eid]! * dt)
    const seamJump = moved.x !== ax + Vel.x[eid]! * dt || moved.y !== ay + Vel.y[eid]! * dt
    Transform.x[eid] = moved.x
    Transform.y[eid] = moved.y
    PrevPos.x[eid] = seamJump ? moved.x : ax
    PrevPos.y[eid] = seamJump ? moved.y : ay
    if (Proj.spin[eid] !== 0) Transform.rot[eid] = Transform.rot[eid]! + Proj.spin[eid]! * dt
  }
}
