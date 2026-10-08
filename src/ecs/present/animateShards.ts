import { query } from 'bitecs'
import { Shard, SHARD_SET, Tint, Transform } from '../components'
import type { Sim } from '../sim'

/** 碎片一路缩小、旋转、淡出 */
export function animateShards(sim: Sim): void {
  const now = sim.fxMs
  for (const eid of query(sim.world, SHARD_SET)) {
    const span = Shard.until[eid]! - Shard.startMs[eid]!
    const t = span > 0 ? Math.min(1, (now - Shard.startMs[eid]!) / span) : 1
    const size = Shard.size[eid]! * (1 - 0.8 * t)
    Transform.w[eid] = size
    Transform.h[eid] = size
    Transform.rot[eid] = Shard.rot[eid]! * t
    Tint.alpha[eid] = 1 - t
  }
}
