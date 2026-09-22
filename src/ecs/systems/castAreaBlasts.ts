import { blastAt } from './shared/areaBlast'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { hasComponent } from 'bitecs'
import { AreaBlast, BlastEcho, Followup } from '../components'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import { nearestTarget, targetsOf } from '../utils/targets'
import type { Sim } from '../sim'

export function castAreaBlasts(sim: Sim): void {
  castScan(sim, AreaBlast, (e) => {
    const src = sourceOf(sim, e)
    const center = nearestTarget(ownerX(e), ownerY(e), targetsOf(sim, src), AreaBlast.detectRange[e]!)
    if (!center) return false
    const damage = Math.round(AreaBlast.damage[e]! * damageMul(sim, e))
    blastAt(sim, e, center.x, center.y, damage)
    if (hasComponent(sim.world, e, BlastEcho)) {
      Followup.left[e] = BlastEcho.delayMs[e]!
      Followup.damage[e] = Math.max(1, Math.round(damage * BlastEcho.ratio[e]!))
    }
    return true
  })
}
