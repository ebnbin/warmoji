import { query } from 'bitecs'
import { Spin, Transform } from '../components'
import type { Sim } from '../sim'

export function spinDecor(sim: Sim): void {
  const dt = sim.dtMs / 1000
  for (const eid of query(sim.world, [Spin, Transform])) {
    Transform.rot[eid] = Transform.rot[eid]! + Spin.rate[eid]! * dt
  }
}
