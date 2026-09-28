import type { Sim } from '../sim'

/** 难度时钟走到的秒数：这一场定了起点就从起点算，否则接着这一局累计打过的时长 */
export function clockSec(sim: Sim): number {
  return (sim.fight.def.clockSec ?? sim.run.combatMs / 1000) + sim.elapsedMs / 1000
}
