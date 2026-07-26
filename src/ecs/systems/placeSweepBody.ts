import { query } from 'bitecs'
import { sweepT } from '../ability/kinds/sweep'
import { DEG2RAD } from '../../util/units'
import type { SweepDef } from '../../types/abilityDefs'
import { Ability, AbilityRef, Aim, Frozen, Held, Swing, Tint, Transform } from '../components'
import { ownerX, ownerY } from '../ability/amp'
import { abilityDefAt } from '../ability/defs'
import { KindSweep } from '../ability/tags'
import type { Sim } from '../sim'

/** 摆位：持有物在瞄准方向两侧的弧上从一端扫到另一端，静止时停在末端 */
export function placeSweepBody(sim: Sim): void {
  for (const e of query(sim.world, [Ability, KindSweep, Aim, Swing, Held, Transform])) {
    const def = abilityDefAt(AbilityRef.def[e]!) as SweepDef
    const frozen = Frozen.v[e] === 1
    if (frozen) Swing.durMs[e] = 0
    const angle = Aim.rad[e]! + (sweepT(sim, e, def.sweepMs) * def.arcDeg * DEG2RAD) / 2
    Transform.x[e] = ownerX(e) + Math.cos(angle) * Held.restOffset[e]!
    Transform.y[e] = ownerY(e) + Math.sin(angle) * Held.restOffset[e]!
    Transform.rot[e] = angle + Held.rotOffset[e]!
    Tint.alpha[e] = frozen ? 0 : 1
  }
}
