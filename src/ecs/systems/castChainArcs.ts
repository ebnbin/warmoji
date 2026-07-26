import { playSfx } from '../../audio/sfx'
import { ChainArc } from '../components'
import { abilityOnHit } from '../store'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { damageTarget } from '../ops/damage'
import { applyAbilityEffects } from '../ops/effects'
import { sourceOf } from '../utils/source'
import { castScan } from '../ops/castScan'
import { nearestTarget, targetsOf } from '../utils/targets'
import type { Target } from '../utils/targets'
import type { Sim } from '../sim'

/** 连锁电弧：命中最近敌人后在敌群间弹跳传导，每跳伤害衰减——敌人越密越强。
 * onHit 施加在末跳落点，已弹跳过的目标排除在外 */
export function castChainArcs(sim: Sim): void {
  castScan(sim, ChainArc, (e) => {
    const src = sourceOf(sim, e)
    const ox = ownerX(e)
    const oy = ownerY(e)
    const visited = new Set<number>()
    let cur = nearestTarget(ox, oy, targetsOf(sim, src), ChainArc.range[e]!, visited)
    if (!cur) return false
    playSfx('zap')
    const points: { x: number; y: number }[] = [{ x: ox, y: oy }]
    let damage = ChainArc.damage[e]! * damageMul(sim, e)
    let last: Target = cur
    for (let hop = 0; hop <= ChainArc.bounces[e]! && cur; hop++) {
      visited.add(cur.eid)
      const from = points[points.length - 1]!
      points.push({ x: cur.x, y: cur.y })
      damageTarget(sim, src, cur.eid, Math.max(1, Math.round(damage)), ChainArc.knockback[e]!, from.x, from.y)
      last = cur
      damage *= ChainArc.decay[e]!
      cur = nearestTarget(cur.x, cur.y, targetsOf(sim, src), ChainArc.arcRange[e]!, visited)
    }
    applyAbilityEffects(sim, src, abilityOnHit[e], { x: last.x, y: last.y, baseDamage: damage, exclude: visited })
    sim.pendingCues.push({ kind: 'lightning', points, color: ChainArc.color[e]! })
    return true
  })
}
