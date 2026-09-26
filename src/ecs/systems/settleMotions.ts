import { hasComponent, query } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { Alive, LeapShape, Motion, MOTION, MotionHit, Payload, SprintShape, Transform } from '../components'
import { damageMul } from '../utils/amp'
import { sourceOf } from '../utils/source'
import { targetsWithin } from '../utils/targets'
import { hit } from './shared/damage'
import { applyAbilityEffects, applyBlast, applyOnHit, struckOf } from './shared/effects'
import { abilityOnHit, motionFx } from '../store'
import { spawnFxBoom, spawnFxCircle } from '../entities/fx'
import type { Sim } from '../sim'

/** 冲刺途中撞到的敌人各吃一下，同一段冲刺不重复 */
function dashHits(sim: Sim, m: number, e: number): void {
  const src = sourceOf(sim, e)
  const x = Transform.x[m]!
  const y = Transform.y[m]!
  const stamp = Motion.stamp[m]!
  const damage = Math.round(Payload.damage[e]! * damageMul(sim, e))
  for (const t of targetsWithin(sim, src, x, y, SprintShape.radius[e]!)) {
    if (MotionHit.stamp[t.eid] === stamp) continue
    MotionHit.stamp[t.eid] = stamp
    const s = struckOf(t.eid)
    if (hit(sim, src, t.eid, damage, { knockback: Payload.knockback[e]!, from: { x, y } })) applyOnHit(sim, src, abilityOnHit[e], x, y, damage, [s])
  }
}

/** 跳跃落地：落点范围内的敌人吃一下，再施加命中效果 */
function landHits(sim: Sim, m: number, e: number): void {
  const src = sourceOf(sim, e)
  const x = Transform.x[m]!
  const y = Transform.y[m]!
  const radius = LeapShape.radius[e]!
  const color = Payload.color[e]!
  const damage = Math.round(Payload.damage[e]! * damageMul(sim, e))
  applyOnHit(sim, src, abilityOnHit[e], x, y, damage, applyBlast(sim, src, x, y, damage, radius, Payload.knockback[e]!))
  playSfx('boom')
  spawnFxCircle(sim, x, y, radius, {
    fill: color,
    fillAlpha: 0.35,
    stroke: color,
    lineWidth: 6,
    lineAlpha: 1,
    fromScale: 0.25,
    toScale: 1.08,
    durationMs: 400,
    depth: 7,
  })
  spawnFxBoom(sim, x, y, radius * 1.4)
}

/** 脚本位移的结算都在身体走完这一帧之后，敌我同一条：冲刺撞击、跳跃落地、被摆布后的落地与撞墙 */
export function settleMotions(sim: Sim): void {
  for (const m of [...query(sim.world, [Motion, Transform])]) {
    const kind = Motion.kind[m]!
    const landed = Motion.landed[m]!
    if (kind === MOTION.none && landed === 0) continue
    if (!Alive.v[m]) continue
    const e = Motion.skill[m]!
    if (e !== 0 && hasComponent(sim.world, e, SprintShape) && SprintShape.radius[e]! > 0 && (kind === MOTION.dash || landed !== 0)) dashHits(sim, m, e)
    if (landed === 0) continue
    Motion.landed[m] = 0
    if (e !== 0 && hasComponent(sim.world, e, LeapShape)) landHits(sim, m, e)
    const after = motionFx[m]
    motionFx[m] = undefined
    Motion.skill[m] = 0
    const then = landed === 2 ? after?.onWall : after?.onLand
    if (after && then) applyAbilityEffects(sim, after.src, then, { x: Transform.x[m]!, y: Transform.y[m]!, baseDamage: after.base, targets: [m], exclude: new Set([m]) })
  }
}
