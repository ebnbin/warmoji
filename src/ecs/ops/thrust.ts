import { reachOf } from '../utils/thrust'
import type { ThrustDef } from '../../types/abilityDefs'
import { playSfx } from '../../audio/sfx'
import { thrustHitIndices } from '../../war/hit'
import { } from '../utils/ease'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { damageTarget } from './damage'
import { Aim, Swing } from '../components'
import { applyAbilityEffects } from './effects'
import { sourceOf } from '../utils/source'
import { nearestAngle, targetsOf } from '../utils/targets'
import type { Sim } from '../sim'

/** 单段突刺：索敌 → 胶囊判定 → 终点命中效果 → 起一段挥击动画 */
export function strike(sim: Sim, e: number, def: ThrustDef): void {
  const src = sourceOf(sim, e)
  const ox = ownerX(e)
  const oy = ownerY(e)
  const list = targetsOf(sim, src)
  const aim = nearestAngle(ox, oy, list, reachOf(def))
  if (aim === null) return
  Aim.rad[e] = aim
  playSfx('whoosh')
  const damage = Math.round(def.damage * damageMul(sim, e))
  for (const i of thrustHitIndices({ x: ox, y: oy }, aim, def.reach, def.hitRadius, list)) {
    damageTarget(sim, src, list[i]!.eid, damage, def.knockback, ox, oy)
  }
  applyAbilityEffects(sim, src, def.onHit, {
    x: ox + Math.cos(aim) * def.reach,
    y: oy + Math.sin(aim) * def.reach,
    baseDamage: damage,
  })
  Swing.startMs[e] = sim.fxMs
  Swing.durMs[e] = def.thrustMs
}
