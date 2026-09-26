import { AI } from '../../../data/enemies'
import { EDir, ETurn, Transform } from '../../components'
import type { Point } from '../../../util/vec'
import type { Sim } from '../../sim'
import { leaderPoint } from '../../utils/team'
import { bodySource } from '../../utils/source'
import { nearestTarget } from '../../utils/targets'

/** 身体眼里最近的敌人：嘲讽、隐匿、视线都由索敌快照统一处理 */
export function nearestFoe(sim: Sim, eid: number, x: number, y: number): Point | null {
  const t = nearestTarget(sim, bodySource(eid), x, y, Infinity)
  return t ? { x: t.x, y: t.y } : null
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

export function aimPoint(sim: Sim, eid: number, atLeader: boolean): Point | null {
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  if (!atLeader) return nearestFoe(sim, eid, x, y)
  const c = leaderPoint(sim)
  const d = sim.hooks.worldDelta(sim, x, y, c.x, c.y)
  return { x: x + d.x, y: y + d.y }
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
