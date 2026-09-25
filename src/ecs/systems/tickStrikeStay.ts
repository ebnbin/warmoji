import { query } from 'bitecs'
import { blinkFlash } from './shared/assassinate'
import { Ability, Assassinate, Blink, Followup, Frozen, Owner, VisOff } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import type { Sim } from '../sim'

export function tickStrikeStay(sim: Sim): void {
  const dt = sim.wdtMs
  for (const e of query(sim.world, [Ability, Assassinate, Followup, Blink])) {
    if (Followup.left[e]! <= 0) continue
    const m = Owner.eid[e]!
    Followup.left[e] = Frozen.v[e] ? 0 : Followup.left[e]! - dt
    if (Followup.left[e]! > 0) {
      VisOff.x[m] = Blink.x[e]!
      VisOff.y[m] = Blink.y[e]!
      continue
    }
    Followup.left[e] = 0
    Blink.x[e] = 0
    Blink.y[e] = 0
    VisOff.x[m] = 0
    VisOff.y[m] = 0
    blinkFlash(sim, ownerX(e), ownerY(e))
  }
}
