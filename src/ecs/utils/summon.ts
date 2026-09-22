import { UNIT } from '../../util/units'
import { ACQUIRE } from '../../data/abilities'
import { Poison } from '../components'
import { targetsOf } from './targets'
import type { Target } from './targets'
import type { Source } from './source'
import type { Sim } from '../sim'

/** 优先未中毒的最近敌人 */
export function pickTarget(sim: Sim, src: Source, bx: number, by: number): Target | null {
  const max = ACQUIRE.range * UNIT
  let bestFresh: Target | null = null
  let bestFreshD = max * max
  let bestAny: Target | null = null
  let bestAnyD = max * max
  for (const t of targetsOf(sim, src)) {
    const dx = t.x - bx
    const dy = t.y - by
    const d = dx * dx + dy * dy
    if (d < bestAnyD) {
      bestAnyD = d
      bestAny = t
    }
    if (Poison.until[t.eid]! <= sim.elapsedMs && d < bestFreshD) {
      bestFreshD = d
      bestFresh = t
    }
  }
  return bestFresh ?? bestAny
}
