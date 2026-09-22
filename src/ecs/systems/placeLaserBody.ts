import { query } from 'bitecs'
import { Ability, Aim, Frozen, Held, Laser, Tint, Transform } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import type { Sim } from '../sim'

export function placeLaserBody(sim: Sim): void {
  for (const e of query(sim.world, [Ability, Laser, Aim, Held, Transform])) {
    const aim = Aim.rad[e]!
    Transform.x[e] = ownerX(e) + Math.cos(aim) * Held.restOffset[e]!
    Transform.y[e] = ownerY(e) + Math.sin(aim) * Held.restOffset[e]!
    Transform.rot[e] = aim + Held.rotOffset[e]!
    Tint.alpha[e] = Frozen.v[e] ? 0 : 1
  }
}
