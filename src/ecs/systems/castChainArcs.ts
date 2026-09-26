import { playSfx } from '../../audio/sfx'
import { ChainArc } from '../components'
import { abilityOnHit } from '../store'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { hit } from './shared/damage'
import { applyAbilityEffects } from './shared/effects'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import { nearestTarget } from '../utils/targets'
import type { Target } from '../utils/targets'
import type { Sim } from '../sim'
import { spawnFxBolt } from '../entities/fx'

export function castChainArcs(sim: Sim): void {
  castScan(sim, ChainArc, (e) => {
    const src = sourceOf(sim, e)
    const ox = ownerX(e)
    const oy = ownerY(e)
    const visited = new Set<number>()
    let cur = nearestTarget(sim, src, ox, oy, ChainArc.range[e]!, visited)
    if (!cur) return false
    playSfx('zap')
    const points: { x: number; y: number }[] = [{ x: ox, y: oy }]
    let damage = ChainArc.damage[e]! * damageMul(sim, e)
    let last: Target = cur
    for (let hop = 0; hop <= ChainArc.bounces[e]! && cur; hop++) {
      visited.add(cur.eid)
      const from = points[points.length - 1]!
      points.push({ x: cur.x, y: cur.y })
      hit(sim, src, cur.eid, Math.max(1, Math.round(damage)), { knockback: ChainArc.knockback[e]!, from: { x: from.x, y: from.y } })
      last = cur
      damage *= ChainArc.decay[e]!
      cur = nearestTarget(sim, src, cur.x, cur.y, ChainArc.arcRange[e]!, visited)
    }
    applyAbilityEffects(sim, src, abilityOnHit[e], { x: last.x, y: last.y, baseDamage: damage, exclude: visited })
    spawnFxBolt(sim, points, ChainArc.color[e]!)
    return true
  })
}
