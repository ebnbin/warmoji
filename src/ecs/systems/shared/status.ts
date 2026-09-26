import { Slow } from '../../components'
import type { Sim } from '../../sim'

/** 减速状态对速度的倍率，任何身体同一条 */
export function slowMul(sim: Sim, eid: number): number {
  return sim.elapsedMs < Slow.until[eid]! ? Slow.mul[eid]! : 1
}
