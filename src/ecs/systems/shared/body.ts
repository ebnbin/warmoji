import { hasComponent } from 'bitecs'
import { BODY_MAX_SPEED } from '../../../data/abilities'
import { Anchored, Clock, Phys } from '../../components'
import type { Sim } from '../../sim'

const MAX_STEP_MS = 50

export function bodyDt(sim: Sim, eid: number): number {
  return Math.min(Clock.v[eid] ? sim.dtMs : sim.wdtMs, MAX_STEP_MS) / 1000
}

/** 冲量按质量折成速度；只封顶冲量带来的增量，不压低本来就更快的身体 */
export function impulse(sim: Sim, eid: number, jx: number, jy: number): void {
  if (!hasComponent(sim.world, eid, Phys) || hasComponent(sim.world, eid, Anchored)) return
  const m = Phys.mass[eid]!
  const ox = Phys.vx[eid]!
  const oy = Phys.vy[eid]!
  let vx = ox + jx / m
  let vy = oy + jy / m
  const len = Math.hypot(vx, vy)
  const cap = Math.max(BODY_MAX_SPEED, Math.hypot(ox, oy))
  if (len > cap) {
    vx = (vx / len) * cap
    vy = (vy / len) * cap
  }
  Phys.vx[eid] = vx
  Phys.vy[eid] = vy
}
