import { query } from 'bitecs'
import { muzzle } from '../utils/projectile'
import { Ability, Aim, Frozen, Held, Tint, Transform } from '../components'
import { KindProjectile } from '../registries/abilityKinds'
import type { Sim } from '../sim'

/** 摆位：持有物定身指向瞄准方向（含左右手挂载位） */
export function placeProjectileBody(sim: Sim): void {
  // 只摆有手持外形的：弩塔同样带 projectile 能力，但它没有 Held，自然不在这批里
  for (const e of query(sim.world, [Ability, KindProjectile, Aim, Held, Transform])) {
    const pos = muzzle(sim, e)
    Transform.x[e] = pos.x
    Transform.y[e] = pos.y
    Transform.rot[e] = Aim.rad[e]! + Held.rotOffset[e]!
    Tint.alpha[e] = Frozen.v[e] ? 0 : 1
  }
}
