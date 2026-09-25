import { query } from 'bitecs'
import { KNOCKBACK } from '../../data/abilities'
import { Dormant, ENEMY_SET, Kv, Step } from '../components'
import type { Sim } from '../sim'

export function applyKnockback(sim: Sim): void {
  const realDelta = sim.dtMs
  const kdt = realDelta / 1000
  const decay = Math.exp(-realDelta / (KNOCKBACK.tauMs * sim.hooks.knockbackTauMul(sim)))
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (Dormant.v[eid]) continue
    const kvx = Kv.x[eid]!
    const kvy = Kv.y[eid]!
    if (kvx === 0 && kvy === 0) continue
    Step.x[eid] = Step.x[eid]! + kvx * kdt
    Step.y[eid] = Step.y[eid]! + kvy * kdt
    if ((kvx * kvx + kvy * kvy) * decay * decay < 100) {
      Kv.x[eid] = 0
      Kv.y[eid] = 0
    } else {
      Kv.x[eid] = kvx * decay
      Kv.y[eid] = kvy * decay
    }
  }
}
