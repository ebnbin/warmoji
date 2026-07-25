import { query } from 'bitecs'
import { UNIT } from '../../core/units'
import { ACQUIRE } from '../../data/abilities'
import { Alive, Dormant, ENEMY_SET, Hurt, Radius, Transform } from '../components'
import { enemyDef, enemyRef, memberRef } from '../store'
import { ownerX, ownerY } from './amp'
import { FACTION, Faction, WallBlocked } from './components'
import type { TargetInfo } from '../../war/abilities/types'
import type { Sim } from '../sim'

// 索敌快照与挑选器（阵营中立）：每帧重建一次两侧的可打击点，能力系统共享。
// 环面地图上真身之外再喂几个镜像坐标，能力零改动即可隔着传送门瞄准。
//
// 过渡期：同一趟另建一份 ref 快照（TargetInfo）供尚未 ECS 化的旧运行时使用。

/** 一个可打击点：真身 eid + 本帧坐标（可能是镜像坐标）+ 判定半径 */
export interface Target {
  readonly eid: number
  readonly x: number
  readonly y: number
  readonly radius: number
}

/** 敌人稳定引用（旧运行时用）：{__eid} + active 存活探针 */
function refOf(eid: number): TargetInfo['ref'] {
  let r = enemyRef[eid]
  if (!r) {
    r = {
      __eid: eid,
      get active() {
        return enemyDef[eid] !== undefined
      },
    }
    enemyRef[eid] = r
  }
  return r as unknown as TargetInfo['ref']
}

/** 队员稳定引用（旧运行时用） */
export function memberRefOf(eid: number): TargetInfo['ref'] {
  let r = memberRef[eid]
  if (!r) {
    r = {
      __eid: eid,
      get active() {
        return Alive.v[eid] === 1
      },
    }
    memberRef[eid] = r
  }
  return r as unknown as TargetInfo['ref']
}

/** 重建敌方存活快照：须先于任何队伍侧出手（含抛射物 onHit 命中链） */
export function refreshEnemyTargets(sim: Sim): void {
  const list: Target[] = []
  const refs: TargetInfo[] = []
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue // 休眠怪不可被索敌
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const radius = Radius.v[eid]!
    const ref = refOf(eid)
    list.push({ eid, x, y, radius })
    refs.push({ x, y, radius, ref })
    for (const g of sim.hooks.ghosts(sim, x, y)) {
      list.push({ eid, x: g.x, y: g.y, radius })
      refs.push({ x: g.x, y: g.y, radius, ref })
    }
  }
  sim.enemyTargets = list
  sim.enemyRefs = refs
}

/** 重建队员存活快照：须先于任何敌方出手 */
export function refreshMemberTargets(sim: Sim): void {
  const list: Target[] = []
  const refs: TargetInfo[] = []
  for (const m of sim.members) {
    if (!Alive.v[m]) continue
    const x = Transform.x[m]!
    const y = Transform.y[m]!
    const radius = Hurt.radius[m]!
    const ref = memberRefOf(m)
    list.push({ eid: m, x, y, radius })
    refs.push({ x, y, radius, ref })
    for (const g of sim.hooks.ghosts(sim, x, y)) {
      list.push({ eid: m, x: g.x, y: g.y, radius })
      refs.push({ x: g.x, y: g.y, radius, ref })
    }
  }
  sim.memberTargets = list
  sim.memberRefs = refs
}

/** 这条能力该打谁：阵营决定索敌落在哪一侧；队伍侧另受断壁遮挡（探头才打得到） */
export function targetsOf(sim: Sim, e: number): readonly Target[] {
  if (Faction.v[e] === FACTION.enemy) return sim.memberTargets
  const list = sim.enemyTargets
  if (sim.walls === null || WallBlocked.v[e] === 0) return list
  const ox = ownerX(e)
  const oy = ownerY(e)
  return list.filter((t) => sim.hooks.wallHit(sim, ox, oy, t.x, t.y) === null)
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
