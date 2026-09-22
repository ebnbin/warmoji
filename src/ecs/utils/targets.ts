import { UNIT } from '../../util/units'
import { ACQUIRE } from '../../data/abilities'
import { FACTION } from '../components'
import type { Source } from './source'
import type { Sim } from '../sim'

/** 坐标可能是镜像坐标 */
export interface Target {
  readonly eid: number
  readonly x: number
  readonly y: number
  readonly radius: number
}

/** 给了视点的还要探得到头 */
export function targetsOf(sim: Sim, src: Source): readonly Target[] {
  if (src.faction === FACTION.enemy) return sim.characterTargets
  const list = sim.enemyTargets
  const sight = src.sight
  if (!sight) return list
  return list.filter((t) => sim.hooks.wallHit(sim, sight.x, sight.y, t.x, t.y) === null)
}

/** exclude 跳过真身 */
export function nearestTarget(
  ox: number,
  oy: number,
  list: readonly Target[],
  maxRange: number,
  exclude?: ReadonlySet<number>,
): Target | null {
  let best: Target | null = null
  let bestD = maxRange * maxRange
  for (const t of list) {
    if (exclude?.has(t.eid)) continue
    const dx = t.x - ox
    const dy = t.y - oy
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      best = t
    }
  }
  return best
}

/** 无目标返回 null；上限缺省 ACQUIRE.range */
export function nearestAngle(
  ox: number,
  oy: number,
  list: readonly Target[],
  maxRange = ACQUIRE.range * UNIT,
): number | null {
  const t = nearestTarget(ox, oy, list, maxRange)
  return t ? Math.atan2(t.y - oy, t.x - ox) : null
}

export function targetsWithin(ox: number, oy: number, list: readonly Target[], maxRange: number): Target[] {
  const r2 = maxRange * maxRange
  return list.filter((t) => {
    const dx = t.x - ox
    const dy = t.y - oy
    return dx * dx + dy * dy <= r2
  })
}
