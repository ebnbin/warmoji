import type { ThrustDef } from '../../../types/abilityDefs'
import { playSfx } from '../../../audio/sfx'
import { thrustHitIndices } from '../../../war/hit'
import { sineEaseOut } from '../../ease'
import { damageMul, damageTarget, ownerX, ownerY } from '../amp'
import { Aim, Swing } from '../../components'
import { applyAbilityEffects } from '../effects'
import { sourceOf } from '../source'
import { nearestAngle, targetsOf } from '../targets'
import type { Sim } from '../../sim'

/** 攻击索敌上限：只打得到射程内的敌人才挥 */
export function reachOf(def: ThrustDef): number {
  return def.reach + def.hitRadius
}

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

/** 挥击进度 0→1→0：去回各半程，两程都走 Sine.easeOut（镜像 yoyo 缓动） */
export function lungeT(sim: Sim, e: number, thrustMs: number): number {
  const half = thrustMs / 2
  if (Swing.durMs[e] === 0 || half <= 0) return 0
  const p = (sim.fxMs - Swing.startMs[e]!) / half
  if (p >= 2) return 0
  return sineEaseOut(p <= 1 ? p : 2 - p)
}
