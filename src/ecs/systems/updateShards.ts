import { query, removeEntity } from 'bitecs'
import { Quad, Shard, SHARD_SET, Tint, Transform } from '../components'
import type { Sim } from '../sim'

export function updateShards(sim: Sim): void {
  const delta = sim.dtMs
  const eids = query(sim.world, SHARD_SET)
  if (eids.length === 0) return
  const dt = delta / 1000
  const now = sim.fxMs
  for (const eid of eids) {
    const span = Shard.until[eid]! - Shard.startMs[eid]!
    const t = span > 0 ? Math.min(1, (now - Shard.startMs[eid]!) / span) : 1
    if (t >= 1) {
      Quad.v[eid] = 0
      removeEntity(sim.world, eid)
      continue
    }
    const p = sim.hooks.constrainShard(sim, Transform.x[eid]! + Shard.vx[eid]! * dt, Transform.y[eid]! + Shard.vy[eid]! * dt)
    Transform.x[eid] = p.x
    Transform.y[eid] = p.y
    const size = Shard.size[eid]! * (1 - 0.8 * t)
    Transform.w[eid] = size
    Transform.h[eid] = size
    Transform.rot[eid] = Shard.rot[eid]! * t
    Tint.alpha[eid] = 1 - t
  }
}
