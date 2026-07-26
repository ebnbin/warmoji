import { airborne } from '../utils/boomerang'
import { launch } from '../ops/boomerang'
import type { BoomerangDef } from '../../types/abilityDefs'
import { ownerX, ownerY } from '../utils/amp'
import { Aim } from '../components'
import { sourceOf } from '../utils/source'
import { castScan } from '../ops/castScan'
import { KindBoomerang } from '../registries/abilityKinds'
import { nearestAngle, targetsOf } from '../utils/targets'
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
