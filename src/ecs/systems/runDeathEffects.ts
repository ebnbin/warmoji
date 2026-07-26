import { replayDeath } from '../ops/death'
import type { Sim } from '../sim'

/** 排空死亡队列:仅作兜底(onDeathFx 未挂时,如 headless 仿真) */
export function runDeathEffects(sim: Sim): void {
  if (sim.pendingDeaths.length === 0) return
  for (const d of sim.pendingDeaths) replayDeath(sim, d)
  sim.pendingDeaths.length = 0
}
