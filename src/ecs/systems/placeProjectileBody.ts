import { query } from 'bitecs'
import { muzzle } from '../utils/projectile'
import { Ability, Aim, Frozen, Held, Shoot, Tint, Transform } from '../components'
import type { Sim } from '../sim'

export function placeProjectileBody(sim: Sim): void {
  for (const e of query(sim.world, [Ability, Shoot, Aim, Held, Transform])) {
    const pos = muzzle(sim, e)
    Transform.x[e] = pos.x
    Transform.y[e] = pos.y
    Transform.rot[e] = Aim.rad[e]! + Held.rotOffset[e]!
    Tint.alpha[e] = Frozen.v[e] ? 0 : 1
  }
}
