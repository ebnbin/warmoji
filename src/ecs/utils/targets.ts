import { query } from 'bitecs'
import { UNIT } from '../../util/units'
import { ACQUIRE } from '../../data/abilities'
import { Dormant, ENEMY_SET, FACTION, Radius, Transform } from '../components'
import type { Source } from './source'
import type { Sim } from '../sim'

// 我方索敌每次现查存活、清醒的敌人，不留跨系统的快照；敌方索敌读 characterTargets

/** 坐标可能是环面镜像坐标 */
export interface Target {
  readonly eid: number
  readonly x: number
  readonly y: number
  readonly radius: number
}

/** 返回 true 即停止遍历 */
type Visit = (eid: number, x: number, y: number, radius: number) => boolean | void

/**
 * 逐个访问与 (cx, cy) 中心距 ≤ reach + 目标半径的目标；给了视点的还要探得到头。
 * 环面上每个落在范围内的像各访问一次，reach 无限时只取最近像。
 * visit 内不得施伤：击杀会原地改动正在遍历的存活列表
 */
export function eachTarget(sim: Sim, src: Source, cx: number, cy: number, reach: number, visit: Visit): void {
  if (src.faction === FACTION.enemy) {
    for (const t of sim.characterTargets) {
      const dx = t.x - cx
      const dy = t.y - cy
      const rr = reach + t.radius
      if (dx * dx + dy * dy > rr * rr) continue
      if (visit(t.eid, t.x, t.y, t.radius)) return
    }
    return
  }
  const sight = src.sight
  const w = sim.mapW
  const h = sim.mapH
  const torus = sim.hooks.torus
  const finite = Number.isFinite(reach)
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue
    const r = Radius.v[eid]!
    const rr = reach + r
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (!torus) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy > rr * rr) continue
      if (sight && sim.hooks.wallHit(sim, sight.x, sight.y, x, y) !== null) continue
      if (visit(eid, x, y, r)) return
      continue
    }
    let dx = x - cx
    let dy = y - cy
    dx -= Math.round(dx / w) * w
    dy -= Math.round(dy / h) * h
    for (let kx = 0; kx < 3; kx++) {
      if (kx > 0 && !finite) break
      const ix = dx + (kx === 0 ? 0 : kx === 1 ? -w : w)
      if (Math.abs(ix) > rr) continue
      for (let ky = 0; ky < 3; ky++) {
        if (ky > 0 && !finite) break
        const iy = dy + (ky === 0 ? 0 : ky === 1 ? -h : h)
        if (ix * ix + iy * iy > rr * rr) continue
        if (sight && sim.hooks.wallHit(sim, sight.x, sight.y, cx + ix, cy + iy) !== null) continue
        if (visit(eid, cx + ix, cy + iy, r)) return
      }
    }
  }
}

/** 同 eachTarget 的筛选；结果是独立数组，可以边遍历边施伤 */
export function targetsNear(sim: Sim, src: Source, cx: number, cy: number, reach: number): Target[] {
  const out: Target[] = []
  eachTarget(sim, src, cx, cy, reach, (eid, x, y, radius) => {
    out.push({ eid, x, y, radius })
  })
  return out
}

/** 中心距严格小于 maxRange；exclude 跳过真身 */
export function nearestTarget(
  sim: Sim,
  src: Source,
  ox: number,
  oy: number,
  maxRange: number,
  exclude?: ReadonlySet<number>,
): Target | null {
  let bestEid = -1
  let bestX = 0
  let bestY = 0
  let bestR = 0
  let bestD = maxRange * maxRange
  eachTarget(sim, src, ox, oy, maxRange, (eid, x, y, radius) => {
    if (exclude?.has(eid)) return
    const dx = x - ox
    const dy = y - oy
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      bestEid = eid
      bestX = x
      bestY = y
      bestR = radius
    }
  })
  return bestEid < 0 ? null : { eid: bestEid, x: bestX, y: bestY, radius: bestR }
}

/** 无目标返回 null；上限缺省 ACQUIRE.range */
export function nearestAngle(
  sim: Sim,
  src: Source,
  ox: number,
  oy: number,
  maxRange = ACQUIRE.range * UNIT,
): number | null {
  const t = nearestTarget(sim, src, ox, oy, maxRange)
  return t ? Math.atan2(t.y - oy, t.x - ox) : null
}
