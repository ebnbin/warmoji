import type { Sim } from '../sim'

/** 须每帧清零，否则登记项堆积 */
export function clearFrameRegisters(sim: Sim): void {
  sim.frameAttractors.length = 0
}
