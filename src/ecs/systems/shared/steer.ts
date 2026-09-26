import { AI } from '../../../data/enemies'
import { EDir, ETurn, MARK } from '../../components'
import { hasMark } from '../../utils/marks'
import type { Point } from '../../../util/vec'
import type { Sim } from '../../sim'
import { bodySource } from '../../utils/source'
import { eachTarget, nearestTarget } from '../../utils/targets'
import type { Found } from '../../utils/targets'

/** 身体眼里最近的敌人：嘲讽、隐匿、视线都由索敌快照统一处理 */
export function nearestFoe(sim: Sim, eid: number, x: number, y: number, range = Infinity): Found | null {
  return nearestTarget(sim, bodySource(eid), x, y, range)
}

/** 优先还没中毒的最近敌人，都中了毒就取最近的 */
export function freshFoe(sim: Sim, eid: number, x: number, y: number, range: number): Found | null {
  let fresh: Found | null = null
  let freshD = range * range
  let any: Found | null = null
  let anyD = range * range
  eachTarget(sim, bodySource(eid), x, y, range, (t, tx, ty, radius) => {
    const dx = tx - x
    const dy = ty - y
    const d = dx * dx + dy * dy
    if (d < anyD) {
      anyD = d
      any = { eid: t, x: tx, y: ty, radius }
    }
    if (!hasMark(sim, t, MARK.dot) && d < freshD) {
      freshD = d
      fresh = { eid: t, x: tx, y: ty, radius }
    }
  })
  return fresh ?? any
}

export function wanderDir(sim: Sim, eid: number): Point {
  if (sim.elapsedMs >= ETurn.at[eid]!) {
    const ang = sim.rng.next() * Math.PI * 2
    EDir.x[eid] = Math.cos(ang)
    EDir.y[eid] = Math.sin(ang)
    ETurn.at[eid] = sim.elapsedMs + AI.wander.turnMinMs + sim.rng.next() * AI.wander.turnJitterMs
  }
  const d = sim.hooks.wanderDir(sim, eid, EDir.x[eid]!, EDir.y[eid]!)
  EDir.x[eid] = d.x
  EDir.y[eid] = d.y
  return d
}

export function fleeSteer(
  x: number,
  y: number,
  awayX: number,
  awayY: number,
  mapW: number,
  mapH: number,
  margin: number,
): Point {
  let fx = awayX
  let fy = awayY
  if (x < margin) fx += ((margin - x) / margin) * 2
  if (x > mapW - margin) fx -= ((x - (mapW - margin)) / margin) * 2
  if (y < margin) fy += ((margin - y) / margin) * 2
  if (y > mapH - margin) fy -= ((y - (mapH - margin)) / margin) * 2
  const len = Math.hypot(fx, fy)
  if (len < 1e-6) {
    const t = Math.hypot(awayX, awayY) || 1
    return { x: -awayY / t, y: awayX / t }
  }
  return { x: fx / len, y: fy / len }
}
