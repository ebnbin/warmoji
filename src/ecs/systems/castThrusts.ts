import { reachOf } from '../utils/thrust'
import { strike } from './shared/thrust'
import { ownerX, ownerY } from '../utils/amp'
import { hasComponent } from 'bitecs'
import { Followup, Thrust, ThrustCombo } from '../components'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import { nearestAngle, targetsOf } from '../utils/targets'
import type { Sim } from '../sim'

export function castThrusts(sim: Sim): void {
  castScan(sim, Thrust, (e) => {
    if (Followup.left[e]! > 0) return false // 二连突在途：本轮不另起
    const src = sourceOf(sim, e)
    if (nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, src), reachOf(e)) === null) return false
    strike(sim, e)
    if (hasComponent(sim.world, e, ThrustCombo)) Followup.left[e] = ThrustCombo.delayMs[e]!
    return true
  })
}
