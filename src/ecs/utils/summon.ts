import { UNIT } from '../../util/units'
import { ACQUIRE } from '../../data/abilities'
import { Poison } from '../components'
import { eachTarget } from './targets'
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
  eachTarget(sim, src, bx, by, max, (eid, x, y, radius) => {
    const dx = x - bx
    const dy = y - by
    const d = dx * dx + dy * dy
    if (d < bestAnyD) {
      bestAnyD = d
      bestAny = { eid, x, y, radius }
    }
    if (Poison.until[eid]! <= sim.elapsedMs && d < bestFreshD) {
      bestFreshD = d
      bestFresh = { eid, x, y, radius }
    }
  })
  return bestFresh ?? bestAny
}
