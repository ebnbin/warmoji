import { Alive, Drop, Owner, Payload, Transform } from '../../components'
import { abilityOnHit } from '../../store'
import { isSameEntity } from '../../utils/identity'
import { damageMul, ownerX, ownerY } from '../../utils/amp'
import { hit } from './damage'
import { applyOnHit } from './effects'
import { sourceOf } from '../../utils/source'
import type { Sim } from '../../sim'

/** 坠物落地：目标还在就砸中它，再施加命中效果 */
export function land(sim: Sim, d: number): void {
  const e = Owner.eid[d]!
  const target = Drop.target[d]!
  if (!isSameEntity(sim.world, target, Drop.targetUid[d]!) || !Alive.v[target]) return
  const src = sourceOf(sim, e)
  const damage = Math.max(1, Math.round(Payload.damage[e]! * damageMul(sim, e)))
  const x = Transform.x[d]!
  const y = Drop.toY[d]!
  if (hit(sim, src, target, damage, { knockback: Payload.knockback[e]!, from: { x: ownerX(e), y: ownerY(e) } })) applyOnHit(sim, src, abilityOnHit[e], x, y, damage, [target])
}
