import { query } from 'bitecs'
import { UNIT } from '../../util/units'
import { MAPS } from '../../data/maps'
import { driftSpeed, riverRect } from '../worlds/river'
import { Drift, Transform } from '../components'
import type { Sim } from '../sim'

// 位姿是派生的：真相是 u 与 cross，x/y 每帧由河道几何算出
export function driftDecor(sim: Sim): void {
  const cfg = MAPS[sim.mapId].river
  if (!cfg) return
  const r = riverRect(sim.mapW, sim.mapH, cfg.width * UNIT)
  const alongLen = r.horizontal ? sim.mapW : sim.mapH
  const halfCross = (r.horizontal ? r.h : r.w) / 2
  const mid = r.horizontal ? r.y + r.h / 2 : r.x + r.w / 2
  const margin = UNIT
  const dt = sim.dtMs / 1000
  for (const eid of query(sim.world, [Drift, Transform])) {
    let u = Drift.u[eid]! + cfg.flow * UNIT * Drift.speedMul[eid]! * dt
    if (u > alongLen + margin) {
      u = -margin
      const cross = (Math.random() * 2 - 1) * halfCross * 0.92
      Drift.cross[eid] = cross
      Drift.speedMul[eid] = driftSpeed(cross / halfCross, cfg, Math.random)
    }
    Drift.u[eid] = u
    const cross = mid + Drift.cross[eid]! + Math.sin(sim.elapsedMs / 1250 + Drift.swayPhase[eid]!) * Drift.swayAmp[eid]!
    if (r.horizontal) {
      Transform.x[eid] = sim.mapW - u
      Transform.y[eid] = cross
    } else {
      Transform.x[eid] = cross
      Transform.y[eid] = u
    }
  }
}
