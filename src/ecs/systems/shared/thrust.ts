import { reachOf } from '../../utils/thrust'
import { playSfx } from '../../../audio/sfx'
import { thrustHitIndices } from '../../utils/hit'
import { damageMul, ownerX, ownerY } from '../../utils/amp'
import { hit } from './damage'
import { Aim, Swing, Thrust } from '../../components'
import { abilityOnHit } from '../../store'
import { applyAbilityEffects } from './effects'
import { sourceOf } from '../../utils/source'
import { nearestAngle, targetsNear } from '../../utils/targets'
import type { Sim } from '../../sim'

export function strike(sim: Sim, e: number): void {
  const src = sourceOf(sim, e)
  const reach = Thrust.reach[e]!
  const ox = ownerX(e)
  const oy = ownerY(e)
  const aim = nearestAngle(sim, src, ox, oy, reachOf(e))
  if (aim === null) return
  const list = targetsNear(sim, src, ox, oy, reachOf(e))
  Aim.rad[e] = aim
  playSfx('whoosh')
  const damage = Math.round(Thrust.damage[e]! * damageMul(sim, e))
  for (const i of thrustHitIndices({ x: ox, y: oy }, aim, reach, Thrust.hitRadius[e]!, list)) {
    hit(sim, src, list[i]!.eid, damage, { knockback: Thrust.knockback[e]!, from: { x: ox, y: oy } })
  }
  applyAbilityEffects(sim, src, abilityOnHit[e], {
    x: ox + Math.cos(aim) * reach,
    y: oy + Math.sin(aim) * reach,
    baseDamage: damage,
  })
  Swing.startMs[e] = sim.fxMs
  Swing.durMs[e] = Thrust.thrustMs[e]!
}
