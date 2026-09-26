import { query } from 'bitecs'
import { Ability, BlinkShape, BlinkState, Frozen, Owner } from '../components'
import { anchorX, anchorY } from '../utils/amp'
import { blinkFlash } from './shared/fire'
import { displace } from './shared/displace'
import type { Sim } from '../sim'

/** 瞬袭的身体到点闪回原位 */
export function tickBlinks(sim: Sim): void {
  const now = sim.elapsedMs
  for (const e of query(sim.world, [Ability, BlinkShape, BlinkState])) {
    if (BlinkState.until[e] === 0) continue
    if (!Frozen.v[e] && now < BlinkState.until[e]!) continue
    BlinkState.until[e] = 0
    if (!BlinkState.back[e]) continue
    const m = Owner.eid[e]!
    blinkFlash(sim, anchorX(e), anchorY(e))
    displace(sim, m, { kind: 'place', x: BlinkState.x[e]!, y: BlinkState.y[e]! }, { self: true, free: true })
    blinkFlash(sim, anchorX(e), anchorY(e))
  }
}
