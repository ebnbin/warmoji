import { query } from 'bitecs'
import { Spin, Transform } from '../components'
import type { Sim } from '../sim'

/** 自转：谁挂了 Spin 谁转。走真实帧长——纯视觉，不吃时停拖慢 */
export function spinDecor(sim: Sim): void {
  const dt = sim.dtMs / 1000
  for (const eid of query(sim.world, [Spin, Transform])) {
    Transform.rot[eid] = Transform.rot[eid]! + Spin.rate[eid]! * dt
  }
}
