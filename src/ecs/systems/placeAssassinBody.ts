import { query } from 'bitecs'
import { Ability, Aim, Assassinate, Frozen, Held, Tint, Transform } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import type { Sim } from '../sim'

/** 摆位：持有物定身指向瞄准方向 */
export function placeAssassinBody(sim: Sim): void {
  for (const e of query(sim.world, [Ability, Assassinate, Aim, Held, Transform])) {
    const aim = Aim.rad[e]!
    Transform.x[e] = ownerX(e) + Math.cos(aim) * Held.restOffset[e]!
    Transform.y[e] = ownerY(e) + Math.sin(aim) * Held.restOffset[e]!
    Transform.rot[e] = aim + Held.rotOffset[e]!
    Tint.alpha[e] = Frozen.v[e] ? 0 : 1
  }
}
