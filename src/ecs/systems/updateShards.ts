import { query, removeEntity } from 'bitecs'
import { Quad, Shard, SHARD_SET } from '../components'
import type { Sim } from '../sim'

/** 碎片的位移由 moveBodies 负责，缩小、旋转、淡出归画面；这里只管到时收走 */
export function updateShards(sim: Sim): void {
  const eids = query(sim.world, SHARD_SET)
  if (eids.length === 0) return
  const now = sim.fxMs
  for (const eid of eids) {
    const span = Shard.until[eid]! - Shard.startMs[eid]!
    if (span > 0 && Math.min(1, (now - Shard.startMs[eid]!) / span) < 1) continue
    Quad.v[eid] = 0
    removeEntity(sim.world, eid)
  }
}
