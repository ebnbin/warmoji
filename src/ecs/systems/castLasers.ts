import { hasComponent } from 'bitecs'
import { Aim, Laser, LaserBackBeam, LaserRadial, Radial } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import { fireBeam } from './shared/laser'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import { nearestAngle, targetsOf } from '../utils/targets'
import type { Sim } from '../sim'

export function castLasers(sim: Sim): void {
  castScan(sim, Laser, (e) => {
    if (Radial.left[e]! > 0) return false // 扫射在途：本轮不另起
    const aim = nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, sourceOf(sim, e)), Laser.range[e]!)
    if (aim === null) return false
    Aim.rad[e] = aim
    if (hasComponent(sim.world, e, LaserRadial)) {
      // 首束下一帧兑现
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
