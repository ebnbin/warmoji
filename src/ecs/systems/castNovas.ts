import { playSfx } from '../../audio/sfx'
import { Nova } from '../components'
import { abilityOnHit } from '../store'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { sourceOf } from '../utils/source'
import { targetsNear } from '../utils/targets'
import { damageTarget } from './shared/damage'
import { applyAbilityEffects } from './shared/effects'
import { castScan } from './shared/castScan'
import { spawnFxBoom, spawnFxCircle } from '../entities/fx'
import type { Sim } from '../sim'

/** 命中效果先于伤害施加：击杀会移除实体，之后再套效果就找不到人了 */
export function castNovas(sim: Sim, scan = castScan): void {
  scan(sim, Nova, (e) => {
    const src = sourceOf(sim, e)
    const x = ownerX(e)
    const y = ownerY(e)
    const radius = Nova.radius[e]!
    const list = targetsNear(sim, src, x, y, radius)
    const damage = Math.round(Nova.damage[e]! * damageMul(sim, e))
    applyAbilityEffects(sim, src, abilityOnHit[e], { x, y, baseDamage: damage, targets: list.map((t) => t.eid) })
    if (damage > 0) for (const t of list) damageTarget(sim, src, t.eid, damage, Nova.knockback[e]!, x, y)
    playSfx('boom')
    const color = Nova.color[e]!
    spawnFxCircle(sim, x, y, radius * 0.5, { fill: 0xffffff, fillAlpha: 0.8, fromScale: 0.6, toScale: 1.6, durationMs: 180, depth: 8 })
    spawnFxCircle(sim, x, y, radius, {
      fill: color,
      fillAlpha: 0.3,
      stroke: color,
      lineWidth: 5,
      lineAlpha: 1,
      fromScale: 0.2,
      toScale: 1.05,
      durationMs: 420,
      depth: 7,
    })
    spawnFxBoom(sim, x, y, radius)
  })
}
