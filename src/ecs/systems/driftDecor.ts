import { query } from 'bitecs'
import { UNIT } from '../../util/units'
import { MAPS } from '../../data/maps'
import { driftSpeed, riverRect } from '../../war/maps/river'
import { Drift, Transform } from '../components'
import type { Sim } from '../sim'

// 水面漂浮物的顺流推进（奔流图）。位姿是**派生的**：真相是沿流向的进度 u 与跨向
// 基线 cross，x/y 每帧由河道几何算出——故视口横竖切换后不必remap，下一帧自己就对了。

/** 顺流漂 + 横摆 + 漂出下游即回上游重进场 */
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
      // 漂出下游 → 回上游重新进场（换个横位/速度）
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
