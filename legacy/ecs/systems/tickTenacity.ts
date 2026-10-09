import { query } from 'bitecs'
import { Alive, Mark, MARK, TAG, Tenacity } from '../components'
import { TENACITY } from '../../data/enemies'
import { addMark, CC_MARKS, isControlled, isSteadfast } from '../utils/marks'
import { expireMarks } from './shared/effects'
import type { Sim } from '../sim'

/** 控制韧性：身上有控制的每一步累进条里，没有的按 drainMs 回落，霸体中不动；满了解掉控制、霸体一阵并清空 */
export function tickTenacity(sim: Sim): void {
  const dt = sim.wdtMs
  for (const eid of query(sim.world, [Tenacity, Mark])) {
    if (!Alive.v[eid] || isSteadfast(sim, eid)) continue
    const fill = Tenacity.fill[eid]!
    if (isControlled(sim, eid)) Tenacity.ms[eid] = Tenacity.ms[eid]! + dt
    else Tenacity.ms[eid] = Math.max(0, Tenacity.ms[eid]! - (dt * fill) / TENACITY.drainMs)
    if (Tenacity.ms[eid]! < fill) continue
    Tenacity.ms[eid] = 0
    expireMarks(sim, eid, CC_MARKS)
    addMark(eid, MARK.unstoppable, TAG.effect, sim.elapsedMs + Tenacity.hold[eid]!)
  }
}
