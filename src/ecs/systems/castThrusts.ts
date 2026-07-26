import { reachOf, strike } from '../ability/kinds/thrust'
import type { ThrustDef } from '../../types/abilityDefs'
import { ownerX, ownerY } from '../ability/amp'
import { Followup } from '../components'
import { sourceOf } from '../ability/source'
import { castScan } from '../ability/castScan'
import { KindThrust } from '../ability/tags'
import { nearestAngle, targetsOf } from '../ability/targets'
import type { Sim } from '../sim'

/** 突刺：held 时持有物挥出收回，无 held 时角色本体前冲收回；胶囊判定内每敌一次伤害。
 * combo 二连突：主刺后隔一段重新索敌再刺一段（不吃冷却）；onHit 施加在突刺终点 */
export function castThrusts(sim: Sim): void {
  castScan<ThrustDef>(sim, KindThrust, (e, def) => {
    if (Followup.left[e]! > 0) return false // 二连突在途：本轮不另起
    // 侦测门槛：射程内无敌人就不出手（不空刺）
    const src = sourceOf(sim, e)
    if (nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, src), reachOf(def)) === null) return false
    strike(sim, e, def)
    if (def.combo) Followup.left[e] = def.combo.delayMs
    return true
  })
}
