import { strongestTarget } from '../utils/assassinate'
import { blinkFlash } from './shared/assassinate'
import { hasComponent } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { Aim, Assassinate, Blink, Execute, Followup, Hp, Iframe, Owner, VisOff } from '../components'
import { abilityOnHit } from '../store'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { damageTarget } from './shared/damage'
import { applyAbilityEffects } from './shared/effects'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import { targetsOf } from '../utils/targets'
import type { Sim } from '../sim'
import { spawnFxSlash } from '../entities/fx'

/** 位移走视觉偏移，不动阵型 */
export function castAssassinates(sim: Sim): void {
  castScan(sim, Assassinate, (e) => {
    if (Followup.left[e]! > 0) return false // 停留帧内不另起
    const src = sourceOf(sim, e)
    const ox = ownerX(e)
    const oy = ownerY(e)
    const target = strongestTarget(ox, oy, targetsOf(sim, src), Assassinate.range[e]!)
    if (!target) return false

    const dx = target.x - ox
    const dy = target.y - oy
    const d = Math.hypot(dx, dy) || 1
    const landX = target.x + (dx / d) * (target.radius + Assassinate.behindDist[e]!)
    const landY = target.y + (dy / d) * (target.radius + Assassinate.behindDist[e]!)
    Aim.rad[e] = Math.atan2(target.y - landY, target.x - landX)
    blinkFlash(sim, ox, oy)
    Blink.x[e] = landX - ox + Blink.x[e]!
    Blink.y[e] = landY - oy + Blink.y[e]!
    const m = Owner.eid[e]!
    VisOff.x[m] = Blink.x[e]!
    VisOff.y[m] = Blink.y[e]!
    const strikeMs = Assassinate.strikeMs[e]!
    Followup.left[e] = strikeMs
    Iframe.last[m] = sim.elapsedMs + strikeMs + 200 - Iframe.ms[m]!
    playSfx('whoosh')
    blinkFlash(sim, landX, landY)

    let damage = Math.round(Assassinate.damage[e]! * damageMul(sim, e))
    if (hasComponent(sim.world, e, Execute)) {
      const hp = Hp.v[target.eid] ?? 0
      const maxHp = Hp.max[target.eid] ?? 0
      if (maxHp > 0 && hp / maxHp <= Execute.hpRatio[e]!) damage = Math.round(damage * Execute.mul[e]!)
    }
    damageTarget(sim, src, target.eid, damage, Assassinate.knockback[e]!, landX, landY)
    applyAbilityEffects(sim, src, abilityOnHit[e], {
      x: target.x,
      y: target.y,
      baseDamage: damage,
      targets: [target.eid],
      exclude: new Set([target.eid]),
    })
    spawnFxSlash(sim, target.x, target.y, Aim.rad[e]!, 34)
    return true
  })
}
