import { UNIT } from '../../util/units'
import { ACQUIRE } from '../../data/abilities'
import { FACTION } from '../components'
import type { Source } from './source'
import type { Sim } from '../sim'

// 索敌快照与挑选器（阵营中立）：每帧重建一次两侧的可打击点，能力系统共享。
// 环面地图上真身之外再喂几个镜像坐标，能力零改动即可隔着传送门瞄准。

/** 一个可打击点：真身 eid + 本帧坐标（可能是镜像坐标）+ 判定半径 */
export interface Target {
  readonly eid: number
  readonly x: number
  readonly y: number
  readonly radius: number
}

/** 这一下该打谁：阵营决定索敌落在哪一侧；给了视点的还要探得到头（断壁遮挡） */
export function targetsOf(sim: Sim, src: Source): readonly Target[] {
  if (src.faction === FACTION.enemy) return sim.characterTargets
  const list = sim.enemyTargets
  const sight = src.sight
  if (!sight) return list
  return list.filter((t) => sim.hooks.wallHit(sim, sight.x, sight.y, t.x, t.y) === null)
}

/** 上限内离 (ox,oy) 最近的目标；exclude 跳过已命中的真身 */
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

/** 瞄准最近目标的角度；无目标或全部超出上限返回 null。上限缺省 ACQUIRE.range */
export function nearestAngle(
  ox: number,
  oy: number,
  list: readonly Target[],
  maxRange = ACQUIRE.range * UNIT,
): number | null {
  const t = nearestTarget(ox, oy, list, maxRange)
  return t ? Math.atan2(t.y - oy, t.x - ox) : null
}

/** 上限内的全部目标（连锁轰炸从中随机追加一发） */
export function targetsWithin(ox: number, oy: number, list: readonly Target[], maxRange: number): Target[] {
  const r2 = maxRange * maxRange
  return list.filter((t) => {
    const dx = t.x - ox
    const dy = t.y - oy
    return dx * dx + dy * dy <= r2
  })
}
