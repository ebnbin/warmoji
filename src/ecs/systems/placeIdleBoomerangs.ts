import { hasComponent, query } from 'bitecs'
import { Ability, Aim, Flyer, Frozen, Held, Tint, Transform } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import { KindBoomerang } from '../registries/abilityKinds'
import type { Sim } from '../sim'

/** 摆位：不在途的镖握在角色手上 */
export function placeIdleBoomerangs(sim: Sim): void {
  for (const e of query(sim.world, [Ability, KindBoomerang, Aim, Held, Transform])) {
    if (hasComponent(sim.world, e, Flyer)) continue
    const aim = Aim.rad[e]!
    Transform.x[e] = ownerX(e) + Math.cos(aim) * Held.restOffset[e]!
    Transform.y[e] = ownerY(e) + Math.sin(aim) * Held.restOffset[e]!
    Transform.rot[e] = aim + Held.rotOffset[e]!
    Tint.alpha[e] = Frozen.v[e] ? 0 : 1
  }
}
