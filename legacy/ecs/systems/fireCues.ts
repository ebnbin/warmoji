import { phaseMs } from '../fight/state'
import type { Sim } from '../sim'

/** 对地图的指令：到点让地图做一次，一再做的排好下一次，做够 times 次为止 */
export function fireCues(sim: Sim): void {
  if (sim.over) return
  const t = phaseMs(sim)
  for (const c of sim.fight.cues) {
    if (t < c.next || c.done >= (c.rule.times ?? Infinity)) continue
    sim.hooks.cue?.(sim, c.rule.cue)
    c.done++
    c.next = c.rule.every === undefined ? Infinity : c.next + c.rule.every
  }
}
