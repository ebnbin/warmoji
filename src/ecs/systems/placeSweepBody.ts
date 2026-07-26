import { query } from 'bitecs'
import { sweepT } from '../utils/sweep'
import { DEG2RAD } from '../../util/units'
import { Ability, Aim, Frozen, Held, Sweep, Swing, Tint, Transform } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import type { Sim } from '../sim'

/** 摆位：持有物在瞄准方向两侧的弧上从一端扫到另一端，静止时停在末端 */
export function placeSweepBody(sim: Sim): void {
  for (const e of query(sim.world, [Ability, Sweep, Aim, Swing, Held, Transform])) {
    const frozen = Frozen.v[e] === 1
    if (frozen) Swing.durMs[e] = 0
    const angle = Aim.rad[e]! + (sweepT(sim, e, Sweep.sweepMs[e]!) * Sweep.arcDeg[e]! * DEG2RAD) / 2
    Transform.x[e] = ownerX(e) + Math.cos(angle) * Held.restOffset[e]!
    Transform.y[e] = ownerY(e) + Math.sin(angle) * Held.restOffset[e]!
    Transform.rot[e] = angle + Held.rotOffset[e]!
    Tint.alpha[e] = frozen ? 0 : 1
  }
}
