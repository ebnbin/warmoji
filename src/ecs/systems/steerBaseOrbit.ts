import { hasComponent, query } from 'bitecs'
import { norm } from '../../util/vec'
import { BaseOrbit, Drive, Enemy, Nest, Slowed, Speed, Steering, Transform } from '../components'
import { nearestAlive } from './shared/steer'
import type { Sim } from '../sim'

export function steerBaseOrbit(sim: Sim): void {
  for (const eid of query(sim.world, [BaseOrbit, Steering, Transform, Speed])) {
    if (!Steering.v[eid]) continue
    const sp = Speed.v[eid]! * Slowed.v[eid]!
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    const target = nearestAlive(sim, eid, ex, ey)
    const nest = Nest.of[eid]!
    let orbit = nest >= 0 && hasComponent(sim.world, nest, Enemy)
    if (orbit && target) {
      const td = sim.hooks.worldDelta(sim, Transform.x[nest]!, Transform.y[nest]!, target.x, target.y)
      const ar = BaseOrbit.aggroRange[eid]!
      if (td.x * td.x + td.y * td.y <= ar * ar) orbit = false
    }
    if (!orbit) {
      if (!target) continue
      const dir = sim.hooks.chaseDir(sim, eid, target.x, target.y)
      Drive.x[eid] = dir.x * sp
      Drive.y[eid] = dir.y * sp
      continue
    }
    const rel = sim.hooks.worldDelta(sim, Transform.x[nest]!, Transform.y[nest]!, ex, ey)
    const rx = rel.x
    const ry = rel.y
    const r = Math.hypot(rx, ry) || 1
    const want = BaseOrbit.orbitRadius[eid]!
    const radial = (want - r) / want
    const dir = norm(-ry / r + (rx / r) * radial * 1.5, rx / r + (ry / r) * radial * 1.5)
    Drive.x[eid] = dir.x * sp
    Drive.y[eid] = dir.y * sp
  }
}
