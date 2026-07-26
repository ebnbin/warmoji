import { query } from 'bitecs'
import { Cooldown, Frozen } from '../../components'
import type { Sim } from '../../sim'

/** 冷却推进：唯一职责是让未冻结的能力冷却按时长递减 */
export function tickCooldowns(sim: Sim, dt: number): void {
  for (const e of query(sim.world, [Cooldown, Frozen])) {
    if (Frozen.v[e]) continue
    Cooldown.left[e] = Cooldown.left[e]! - dt
  }
}
