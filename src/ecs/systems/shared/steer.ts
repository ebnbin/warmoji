import { AI } from '../../../data/enemies'
import { Alive, EDir, ETurn, Transform } from '../../components'
import type { Point } from '../../../util/vec'
import type { Sim } from '../../sim'
import { leaderPoint } from '../../utils/team'

/** 影遁期间敌人找不到任何队员；嘲讽期间所有敌人都只看得见嘲讽者 */
export function nearestAlive(sim: Sim, x: number, y: number): Point | null {
  if (sim.elapsedMs < sim.stealthUntil) return null
  const taunt = sim.taunt
  if (taunt && sim.elapsedMs < taunt.until && Alive.v[taunt.eid]) {
    const d = sim.hooks.worldDelta(sim, x, y, Transform.x[taunt.eid]!, Transform.y[taunt.eid]!)
    if (d.x * d.x + d.y * d.y <= taunt.radius * taunt.radius) return { x: x + d.x, y: y + d.y }
  }
  let bestX = 0
  let bestY = 0
  let bestD = Infinity
  for (const eid of sim.characters) {
    if (!Alive.v[eid]) continue
    const d = sim.hooks.worldDelta(sim, x, y, Transform.x[eid]!, Transform.y[eid]!)
    const d2 = d.x * d.x + d.y * d.y
    if (d2 < bestD) {
      bestD = d2
      bestX = x + d.x
      bestY = y + d.y
    }
  }
  return bestD === Infinity ? null : { x: bestX, y: bestY }
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
  if (!atLeader) return nearestAlive(sim, x, y)
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
