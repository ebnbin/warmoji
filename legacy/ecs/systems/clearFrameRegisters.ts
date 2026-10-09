import type { Sim } from '../sim'

export function clearFrameRegisters(sim: Sim): void {
  sim.frameAttractors.length = 0
}
