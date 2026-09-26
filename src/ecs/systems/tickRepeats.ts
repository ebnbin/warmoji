import { query } from 'bitecs'
import { Ability, Frozen, Repeat, RepeatState } from '../components'
import { fireRepeat } from './shared/fire'
import type { Sim } from '../sim'

/** 延迟重复：到点打下一发，宿主冻结则作废 */
export function tickRepeats(sim: Sim): void {
  const now = sim.elapsedMs
  for (const e of query(sim.world, [Ability, Repeat, RepeatState])) {
    if (RepeatState.left[e]! <= 0) continue
    if (Frozen.v[e]) {
      RepeatState.left[e] = 0
      continue
    }
    while (RepeatState.left[e]! > 0 && now >= RepeatState.nextAt[e]!) {
      if (!fireRepeat(sim, e)) {
        RepeatState.left[e] = 0
        break
      }
      RepeatState.left[e] = RepeatState.left[e]! - 1
      RepeatState.nextAt[e] = RepeatState.nextAt[e]! + Repeat.delayMs[e]!
    }
  }
}
