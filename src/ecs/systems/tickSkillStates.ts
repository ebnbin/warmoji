import { playSfx } from '../../audio/sfx'
import { Alive, LeapShape, Leaping, MARK, Payload, SprintHit, Sprinting, SprintShape, Tint, Transform, VisOff } from '../components'
import { hasMark } from '../utils/marks'
import { damageMul } from '../utils/amp'
import { sourceOf } from '../utils/source'
import { targetsWithin } from '../utils/targets'
import { hit } from './shared/damage'
import { applyBlast, applyOnHit, struckOf } from './shared/effects'
import { abilityOnHit } from '../store'
import { spawnFxBoom, spawnFxCircle } from '../entities/fx'
import type { Sim } from '../sim'

/** 冲刺撞击、跳跃落地与隐匿半透明都在身体走完这一帧之后结算；不再是队长的身体立刻停下；冲刺的结束由 moveBodies 判定 */
export function tickSkillStates(sim: Sim): void {
  for (const m of sim.characters) {
    if (m !== sim.leader) {
      Sprinting.active[m] = 0
      if (Leaping.active[m]) {
        Leaping.active[m] = 0
        Leaping.landed[m] = 0
        VisOff.y[m] = 0
      }
    } else {
      if (Sprinting.active[m]) sprintHits(sim, m)
      if (Leaping.landed[m]) land(sim, m)
    }
    if (Alive.v[m]) Tint.alpha[m] = hasMark(sim, m, MARK.hide) ? 0.45 : 1
  }
}

function sprintHits(sim: Sim, m: number): void {
  const e = Sprinting.skill[m]!
  const src = sourceOf(sim, e)
  const x = Transform.x[m]!
  const y = Transform.y[m]!
  const stamp = Sprinting.stamp[m]!
  const damage = Math.round(Payload.damage[e]! * damageMul(sim, e))
  for (const t of targetsWithin(sim, src, x, y, SprintShape.radius[e]!)) {
    if (SprintHit.stamp[t.eid] === stamp) continue
    SprintHit.stamp[t.eid] = stamp
    const s = struckOf(t.eid)
    if (hit(sim, src, t.eid, damage, { knockback: Payload.knockback[e]!, from: { x, y } })) applyOnHit(sim, src, abilityOnHit[e], x, y, damage, [s])
  }
}

function land(sim: Sim, m: number): void {
  const e = Leaping.skill[m]!
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
  Leaping.landed[m] = 0
  Leaping.active[m] = 0
}
