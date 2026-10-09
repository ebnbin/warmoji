import type { Sim } from '../sim'

export function worldTick(sim: Sim): void {
  sim.hooks.tick(sim, sim.wdtMs)
}
