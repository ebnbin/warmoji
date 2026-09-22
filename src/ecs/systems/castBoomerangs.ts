import { launch } from '../entities/weapon'
import { ownerX, ownerY } from '../utils/amp'
import { Aim, Boomerang, Thrown } from '../components'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import { nearestAngle, targetsOf } from '../utils/targets'
import type { Sim } from '../sim'

export function castBoomerangs(sim: Sim): void {
  castScan(sim, Boomerang, (e) => {
    if (Thrown.n[e]! > 0) return false // 未全部接住不另起
    const aim = nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, sourceOf(sim, e)))
    if (aim === null) return false
    Aim.rad[e] = aim
    launch(sim, e, aim)
    return false // 冷却待全部接住后才开始计
  })
}
