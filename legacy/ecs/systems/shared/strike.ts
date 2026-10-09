import { Alive, Drop, Owner, Payload, Transform } from '../../components'
import { abilityOnHit } from '../../store'
import { isSameEntity } from '../../utils/identity'
import { anchorX, anchorY } from '../../utils/ability'
import { hit } from './damage'
import { applyOnHit, struckOf } from './effects'
import { sourceOf } from '../../utils/source'
import type { Sim } from '../../sim'

/** 坠物落地：目标还在就砸中它，再施加命中效果 */
export function land(sim: Sim, d: number): void {
  const e = Owner.eid[d]!
  const target = Drop.target[d]!
  if (!isSameEntity(sim.world, target, Drop.targetUid[d]!) || !Alive.v[target]) return
  const src = sourceOf(sim, e)
  const damage = Drop.damage[d]!
  const x = Transform.x[d]!
  const y = Drop.toY[d]!
  const s = struckOf(target)
  if (hit(sim, src, target, damage, { knockback: Payload.knockback[e]!, from: { x: anchorX(e), y: anchorY(e) }, cue: 'shown' })) applyOnHit(sim, src, abilityOnHit[e], x, y, damage, [s])
}
