import { launch } from '../entities/weapon'
import { ownerX, ownerY } from '../utils/amp'
import { Aim, Boomerang, Thrown } from '../components'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import { nearestAngle } from '../utils/targets'
import type { Sim } from '../sim'

export function castBoomerangs(sim: Sim): void {
  castScan(sim, Boomerang, (e) => {
    if (Thrown.n[e]! > 0) return false
    const aim = nearestAngle(sim, sourceOf(sim, e), ownerX(e), ownerY(e))
    if (aim === null) return false
    Aim.rad[e] = aim
    launch(sim, e, aim)
    return false
  })
}
