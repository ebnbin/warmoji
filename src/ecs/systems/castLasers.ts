import { hasComponent } from 'bitecs'
import { Aim, Laser, LaserBackBeam, LaserRadial, Radial } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import { fireBeam } from '../ops/laser'
import { sourceOf } from '../utils/source'
import { castScan } from '../ops/castScan'
import { nearestAngle, targetsOf } from '../utils/targets'
import type { Sim } from '../sim'

/** 贯穿激光：向最近敌人发射光束，线段胶囊判定打穿直线上所有敌人。
 * LaserBackBeam 正后方补一道；LaserRadial 出手改为绕一周的多向序列扫射（取代常规单束） */
export function castLasers(sim: Sim): void {
  castScan(sim, Laser, (e) => {
    if (Radial.left[e]! > 0) return false // 扫射在途：本轮不另起
    const aim = nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, sourceOf(sim, e)), Laser.range[e]!)
    if (aim === null) return false // 最近敌人在射程内才开火
    Aim.rad[e] = aim
    if (hasComponent(sim.world, e, LaserRadial)) {
      // 从瞄准角起步，逐束旋转铺满 360°；首束下一帧兑现
      Radial.left[e] = LaserRadial.beams[e]!
      Radial.nextAt[e] = sim.elapsedMs
      Radial.angle[e] = aim
      return true
    }
    fireBeam(sim, e, aim, 1)
    if (hasComponent(sim.world, e, LaserBackBeam)) fireBeam(sim, e, aim + Math.PI, 1)
    return true
  })
}
