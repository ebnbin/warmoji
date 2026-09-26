import { Clock } from '../../components'
import type { Sim } from '../../sim'

const MAX_STEP_MS = 50

export function bodyDt(sim: Sim, eid: number): number {
  return Math.min(Clock.v[eid] ? sim.dtMs : sim.wdtMs, MAX_STEP_MS) / 1000
}
