import { hasComponent, query, removeEntity } from 'bitecs'
import { land } from './shared/strike'
import { Drop, Owner, Tint, Transform } from '../components'
import type { Sim } from '../sim'

export function updateDrops(sim: Sim): void {
  for (const d of [...query(sim.world, [Drop, Owner])]) {
    if (!hasComponent(sim.world, d, Drop)) continue // 上一枚落地时连带回收了它
    const p = (sim.fxMs - Drop.startMs[d]!) / Drop.durMs[d]!
    if (p < 0) continue // 错峰等待中不显形
    if (p < 1) {
      const q = p * p
      Transform.y[d] = Drop.fromY[d]! + (Drop.toY[d]! - Drop.fromY[d]!) * q
      Tint.alpha[d] = q
      continue
    }
    land(sim, d)
    removeEntity(sim.world, d)
  }
}
