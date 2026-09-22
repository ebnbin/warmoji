import { query } from 'bitecs'
import { Ability, Aim, Frozen, LaserRadial, Radial } from '../components'
import { fireBeam } from './shared/laser'
import type { Sim } from '../sim'

/** 持有者倒下即作废 */
export function fireRadials(sim: Sim): void {
  for (const e of query(sim.world, [Ability, LaserRadial, Radial])) {
    if (Radial.left[e]! <= 0) continue
    if (Frozen.v[e]) {
      Radial.left[e] = 0
      continue
    }
    while (Radial.left[e]! > 0 && Radial.nextAt[e]! <= sim.elapsedMs) {
      const angle = Radial.angle[e]!
      Aim.rad[e] = angle
      fireBeam(sim, e, angle, LaserRadial.ratio[e]!)
      Radial.left[e] = Radial.left[e]! - 1
      Radial.angle[e] = angle + (2 * Math.PI) / LaserRadial.beams[e]!
      Radial.nextAt[e] = Radial.nextAt[e]! + LaserRadial.stepMs[e]!
    }
  }
}
