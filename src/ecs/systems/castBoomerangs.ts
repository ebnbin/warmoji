import { airborne, launch } from '../ability/kinds/boomerang'
import type { BoomerangDef } from '../../types/abilityDefs'
import { ownerX, ownerY } from '../ability/amp'
import { Aim } from '../components'
import { sourceOf } from '../ability/source'
import { castScan } from '../ability/castScan'
import { KindBoomerang } from '../ability/tags'
import { nearestAngle, targetsOf } from '../ability/targets'
import type { Sim } from '../sim'

/** 每帧：推进在途的镖 + 摆位闲置的持有物 */
export function castBoomerangs(sim: Sim): void {
  castScan<BoomerangDef>(sim, KindBoomerang, (e, def) => {
    if (airborne(sim, e) > 0) return false // 还没接住：不另起，也不消耗冷却
    const aim = nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, sourceOf(sim, e)))
    if (aim === null) return false
    Aim.rad[e] = aim
    launch(sim, e, def, aim)
    return false // 冷却待全部接住后才开始计
  })
}
