import { hasComponent, query, removeEntity } from 'bitecs'
import { pickTarget } from '../utils/summon'
import { playSfx } from '../../audio/sfx'
import { Built, Frozen, Minion, Sprite, Summon, Swarmer, Tint, Transform } from '../components'
import { abilityOnHit } from '../store'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { damageTarget } from './shared/damage'
import { applyAbilityEffects } from './shared/effects'
import { sourceOf } from '../utils/source'
import type { Sim } from '../sim'

export function updateBees(sim: Sim): void {
  const dt = sim.wdtMs
  for (const b of [...query(sim.world, [Swarmer, Minion, Built, Transform])]) {
    if (!hasComponent(sim.world, b, Minion)) continue // 同波的前一只自毁时连带回收了它
    const e = Built.by[b]!
    if (Frozen.v[e]) {
      Tint.alpha[b] = 0
      continue
    }
    Tint.alpha[b] = 1
    if (sim.elapsedMs >= Minion.dieAt[b]!) {
      removeEntity(sim.world, b)
      continue
    }
    const bx = Transform.x[b]!
    const by = Transform.y[b]!
    const src = sourceOf(sim, e)
    const target = pickTarget(sim, src, bx, by)
    Minion.phase[b] = Minion.phase[b]! + (Math.min(dt, 50) / 1000) * 3
    const destX = target ? target.x : ownerX(e) + Math.cos(Minion.phase[b]!) * 40
    const destY = target ? target.y : ownerY(e) + Math.sin(Minion.phase[b]!) * 40 - 8
    const dx = destX - bx
    const dy = destY - by
    const d = Math.hypot(dx, dy)
    const step = (Summon.speed[e]! * Math.min(dt, 50)) / 1000
    if (d > step) {
      Transform.x[b] = bx + (dx / d) * step
      Transform.y[b] = by + (dy / d) * step
    } else {
      Transform.x[b] = destX
      Transform.y[b] = destY
    }
    Sprite.flipX[b] = dx < 0 ? 1 : 0
    if (!target) continue
    const rr = target.radius + Summon.size[e]! * 0.35
    const tx = target.x - Transform.x[b]!
    const ty = target.y - Transform.y[b]!
    if (tx * tx + ty * ty > rr * rr) continue
    const damage = Math.round(Summon.damage[e]! * damageMul(sim, e))
    damageTarget(sim, src, target.eid, damage, Summon.knockback[e]!, Transform.x[b]!, Transform.y[b]!)
    applyAbilityEffects(sim, src, abilityOnHit[e], { x: target.x, y: target.y, baseDamage: damage, targets: [target.eid] })
    playSfx('hit')
    removeEntity(sim.world, b)
  }
}
