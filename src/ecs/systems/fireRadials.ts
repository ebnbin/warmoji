import { query } from 'bitecs'
import { fireBeam } from '../ability/kinds/laser'
import type { LaserDef } from '../../types/abilityDefs'
import { Ability, AbilityRef, Aim, Frozen, Radial } from '../components'
import { abilityDefAt } from '../ability/defs'
import { KindLaser } from '../ability/tags'
import type { Sim } from '../sim'

/** 全域扫射：按时序逐束兑现，跟随角色实时位置；持有者倒下即作废 */
export function fireRadials(sim: Sim): void {
  for (const e of query(sim.world, [Ability, KindLaser, Radial])) {
    if (Radial.left[e]! <= 0) continue
    if (Frozen.v[e]) {
      Radial.left[e] = 0
      continue
    }
    const def = abilityDefAt(AbilityRef.def[e]!) as LaserDef
    if (!def.radial) continue
    while (Radial.left[e]! > 0 && Radial.nextAt[e]! <= sim.elapsedMs) {
      const angle = Radial.angle[e]!
      Aim.rad[e] = angle
      fireBeam(sim, e, def, angle, def.radial.ratio)
      Radial.left[e] = Radial.left[e]! - 1
      Radial.angle[e] = angle + (2 * Math.PI) / def.radial.beams
      Radial.nextAt[e] = Radial.nextAt[e]! + def.radial.stepMs
    }
  }
}
