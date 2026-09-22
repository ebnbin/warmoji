import { replayDeath } from './shared/death'
import type { Sim } from '../sim'

/** onDeathFx 未挂时的兜底 */
export function runDeathEffects(sim: Sim): void {
  if (sim.pendingDeaths.length === 0) return
  for (const d of sim.pendingDeaths) replayDeath(sim, d)
  sim.pendingDeaths.length = 0
}
