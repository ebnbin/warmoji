import { fireBeam } from '../ability/kinds/laser'
import type { LaserDef } from '../../types/abilityDefs'
import { ownerX, ownerY } from '../ability/amp'
import { Aim, Radial } from '../components'
import { sourceOf } from '../ability/source'
import { castScan } from '../ability/castScan'
import { KindLaser } from '../ability/tags'
import { nearestAngle, targetsOf } from '../ability/targets'
import type { Sim } from '../sim'

/** 贯穿激光：向最近敌人发射光束，线段胶囊判定打穿直线上所有敌人。
 * backBeam 正后方补一道；radial 出手改为绕一周的多向序列扫射（取代常规单束） */
export function castLasers(sim: Sim): void {
  castScan<LaserDef>(sim, KindLaser, (e, def) => {
    if (Radial.left[e]! > 0) return false // 扫射在途：本轮不另起
    const aim = nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, sourceOf(sim, e)), def.range)
    if (aim === null) return false // 最近敌人在射程内才开火
    Aim.rad[e] = aim
    if (def.radial) {
      // 从瞄准角起步，逐束旋转铺满 360°；首束下一帧兑现
      Radial.left[e] = def.radial.beams
      Radial.nextAt[e] = sim.elapsedMs
      Radial.angle[e] = aim
      return true
    }
    fireBeam(sim, e, def, aim, 1)
    if (def.backBeam) fireBeam(sim, e, def, aim + Math.PI, 1)
    return true
  })
}
