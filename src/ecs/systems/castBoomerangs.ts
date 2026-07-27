import { airborne } from '../utils/boomerang'
import { launch } from '../entities/weapon'
import { ownerX, ownerY } from '../utils/amp'
import { Aim, Boomerang } from '../components'
import { sourceOf } from '../utils/source'
import { castScan } from '../ops/castScan'
import { nearestAngle, targetsOf } from '../utils/targets'
import type { Sim } from '../sim'

/** 每帧：推进在途的镖 + 摆位闲置的持有物 */
export function castBoomerangs(sim: Sim): void {
  castScan(sim, Boomerang, (e) => {
    if (airborne(sim, e) > 0) return false // 还没接住：不另起，也不消耗冷却
    const aim = nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, sourceOf(sim, e)))
    if (aim === null) return false
    Aim.rad[e] = aim
    launch(sim, e, aim)
    return false // 冷却待全部接住后才开始计
  })
}
