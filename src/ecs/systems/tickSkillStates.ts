import { playSfx } from '../../audio/sfx'
import { Alive, Follow, Hidden, Leap, Leaping, Rush, RushHit, Rushing, Tint, VisOff } from '../components'
import { damageMul } from '../utils/amp'
import { sourceOf } from '../utils/source'
import { targetsNear } from '../utils/targets'
import { damageTarget } from './shared/damage'
import { applyBlast } from './shared/effects'
import { spawnFxBoom, spawnFxCircle } from '../entities/fx'
import type { Sim } from '../sim'

/** 冲刺撞击、跳跃落地与隐匿半透明都在身体走完这一帧之后结算；不再是队长的身体立刻停下 */
export function tickSkillStates(sim: Sim): void {
  const now = sim.elapsedMs
  for (const m of sim.characters) {
    if (m !== sim.leader) {
      Rushing.active[m] = 0
      if (Leaping.active[m]) {
        Leaping.active[m] = 0
        Leaping.landed[m] = 0
        VisOff.y[m] = 0
      }
    } else {
      if (Rushing.active[m]) rushHits(sim, m)
      if (Leaping.landed[m]) land(sim, m)
    }
    const hidden = now < Hidden.until[m]!
    if (hidden !== (Hidden.tinted[m] === 1)) {
      Hidden.tinted[m] = hidden ? 1 : 0
      if (Alive.v[m]) Tint.alpha[m] = hidden ? 0.45 : 1
    }
  }
}

function rushHits(sim: Sim, m: number): void {
  const e = Rushing.skill[m]!
  const src = sourceOf(sim, e)
  const x = Follow.x[m]!
  const y = Follow.y[m]!
  const stamp = Rushing.stamp[m]!
  const damage = Math.round(Rush.damage[e]! * damageMul(sim, e))
  for (const t of targetsNear(sim, src, x, y, Rush.hitRadius[e]!)) {
    if (RushHit.stamp[t.eid] === stamp) continue
    RushHit.stamp[t.eid] = stamp
    damageTarget(sim, src, t.eid, damage, Rush.knockback[e]!, x, y)
  }
  if (Rushing.msLeft[m]! <= 0) Rushing.active[m] = 0
}

function land(sim: Sim, m: number): void {
  const e = Leaping.skill[m]!
  const src = sourceOf(sim, e)
  const x = Follow.x[m]!
  const y = Follow.y[m]!
  const radius = Leap.radius[e]!
  const color = Leap.color[e]!
  applyBlast(sim, src, x, y, Math.round(Leap.damage[e]! * damageMul(sim, e)), radius, Leap.knockback[e]!)
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
