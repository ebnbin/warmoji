import { query } from 'bitecs'
import { Ability, BlinkShape, BlinkState, Frozen, Owner, VisOff } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import { blinkFlash } from './shared/fire'
import type { Sim } from '../sim'

/** 瞬袭的身体到点闪回原位 */
export function tickBlinks(sim: Sim): void {
  const now = sim.elapsedMs
  for (const e of query(sim.world, [Ability, BlinkShape, BlinkState])) {
    if (BlinkState.until[e] === 0) continue
    if (!Frozen.v[e] && now < BlinkState.until[e]!) continue
    BlinkState.until[e] = 0
    const m = Owner.eid[e]!
    VisOff.x[m] = 0
    VisOff.y[m] = 0
    blinkFlash(sim, ownerX(e), ownerY(e))
  }
}
