import { reachOf } from '../utils/thrust'
import { strike } from './shared/thrust'
import { ownerX, ownerY } from '../utils/amp'
import { hasComponent } from 'bitecs'
import { Followup, Thrust, ThrustCombo } from '../components'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import { nearestAngle, targetsOf } from '../utils/targets'
import type { Sim } from '../sim'

/** 突刺：held 时持有物挥出收回，无 held 时角色本体前冲收回；胶囊判定内每敌一次伤害。
 * combo 二连突：主刺后隔一段重新索敌再刺一段（不吃冷却）；onHit 施加在突刺终点 */
export function castThrusts(sim: Sim): void {
  castScan(sim, Thrust, (e) => {
    if (Followup.left[e]! > 0) return false // 二连突在途：本轮不另起
    // 侦测门槛：射程内无敌人就不出手（不空刺）
    const src = sourceOf(sim, e)
    if (nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, src), reachOf(e)) === null) return false
    strike(sim, e)
    if (hasComponent(sim.world, e, ThrustCombo)) Followup.left[e] = ThrustCombo.delayMs[e]!
    return true
  })
}
