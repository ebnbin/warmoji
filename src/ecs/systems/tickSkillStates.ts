import { playSfx } from '../../audio/sfx'
import { Alive, Leap, Rush, Tint } from '../components'
import { damageMul } from '../utils/amp'
import { sourceOf } from '../utils/source'
import { targetsNear } from '../utils/targets'
import { leaderX, leaderY } from '../utils/team'
import { damageTarget } from './shared/damage'
import { applyBlast } from './shared/effects'
import { spawnFxBoom, spawnFxCircle } from '../entities/fx'
import type { Sim } from '../sim'

/** 冲刺沿途撞击、跳跃落地爆发、嘲讽到期与隐匿的半透明，都在队长走完这一帧之后结算 */
export function tickSkillStates(sim: Sim): void {
  const now = sim.elapsedMs
  const cx = leaderX(sim)
  const cy = leaderY(sim)
  const rush = sim.rush
  if (rush) {
    const e = rush.e
    const src = sourceOf(sim, e)
    const damage = Math.round(Rush.damage[e]! * damageMul(sim, e))
    for (const t of targetsNear(sim, src, cx, cy, Rush.hitRadius[e]!)) {
      if (rush.hit.has(t.eid)) continue
      rush.hit.add(t.eid)
      damageTarget(sim, src, t.eid, damage, Rush.knockback[e]!, cx, cy)
    }
    if (rush.msLeft <= 0) sim.rush = null
  }
  const leap = sim.leap
  if (leap?.landed) {
    const e = leap.e
    const src = sourceOf(sim, e)
    const radius = Leap.radius[e]!
    const color = Leap.color[e]!
    applyBlast(sim, src, cx, cy, Math.round(Leap.damage[e]! * damageMul(sim, e)), radius, Leap.knockback[e]!)
    playSfx('boom')
    spawnFxCircle(sim, cx, cy, radius, {
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
    spawnFxBoom(sim, cx, cy, radius * 1.4)
    sim.leap = null
  }
  if (sim.taunt && now >= sim.taunt.until) sim.taunt = null
  const stealth = now < sim.stealthUntil
  if (stealth !== sim.stealthTinted) {
    sim.stealthTinted = stealth
    for (const m of sim.characters) if (Alive.v[m]) Tint.alpha[m] = stealth ? 0.45 : 1
  }
}
