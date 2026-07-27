import { query } from 'bitecs'
import { Ability, Aim, Boomerang, Frozen, Held, Thrown, Tint, Transform } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import type { Sim } from '../sim'

/** 摆位：镖握在角色手上；在途期间隐藏（掷出去的是另一颗实体，武器本身不动） */
export function placeIdleBoomerangs(sim: Sim): void {
  for (const e of query(sim.world, [Ability, Boomerang, Aim, Held, Transform])) {
    const aim = Aim.rad[e]!
    Transform.x[e] = ownerX(e) + Math.cos(aim) * Held.restOffset[e]!
    Transform.y[e] = ownerY(e) + Math.sin(aim) * Held.restOffset[e]!
    Transform.rot[e] = aim + Held.rotOffset[e]!
    Tint.alpha[e] = Frozen.v[e] || Thrown.n[e]! > 0 ? 0 : 1
  }
}
