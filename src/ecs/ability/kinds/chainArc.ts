import type { ChainArcDef } from '../../../types/abilityDefs'
import { playSfx } from '../../../audio/sfx'
import { damageMul, damageTarget, ownerX, ownerY } from '../amp'
import { applyAbilityEffects } from '../effects'
import { sourceOf } from '../source'
import { castScan } from '../systems/cast'
import { KindChainArc } from '../tags'
import { nearestTarget, targetsOf } from '../targets'
import type { Target } from '../targets'
import type { Sim } from '../../sim'

/** 连锁电弧：命中最近敌人后在敌群间弹跳传导，每跳伤害衰减——敌人越密越强。
 * onHit 施加在末跳落点，已弹跳过的目标排除在外 */
export function castChainArcs(sim: Sim): void {
  castScan<ChainArcDef>(sim, KindChainArc, (e, def) => {
    const src = sourceOf(sim, e)
    const ox = ownerX(e)
    const oy = ownerY(e)
    const visited = new Set<number>()
    let cur = nearestTarget(ox, oy, targetsOf(sim, src), def.range, visited)
    if (!cur) return false
    playSfx('zap')
    const points: { x: number; y: number }[] = [{ x: ox, y: oy }]
    let damage = def.damage * damageMul(sim, e)
    let last: Target = cur
    for (let hop = 0; hop <= def.bounces && cur; hop++) {
      visited.add(cur.eid)
      const from = points[points.length - 1]!
      points.push({ x: cur.x, y: cur.y })
      damageTarget(sim, src, cur.eid, Math.max(1, Math.round(damage)), def.knockback, from.x, from.y)
      last = cur
      damage *= def.decay
      cur = nearestTarget(cur.x, cur.y, targetsOf(sim, src), def.arcRange, visited)
    }
    applyAbilityEffects(sim, src, def.onHit, { x: last.x, y: last.y, baseDamage: damage, exclude: visited })
    sim.pendingCues.push({ kind: 'lightning', points, color: def.color })
    return true
  })
}
