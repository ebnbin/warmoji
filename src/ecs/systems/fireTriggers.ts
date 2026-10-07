import { scheduleCall } from '../entities/schedule'
import type { Sim } from '../sim'

/** 按地图事件放出的一队：这件事每发生一次，过 atMs 放出一队，放够 times 队为止 */
export function fireTriggers(sim: Sim): void {
  const f = sim.fight
  for (const t of f.triggers) {
    const n = f.events[t.on] ?? 0
    for (; t.seen < n; t.seen++) {
      if (t.fired >= (t.rule.times ?? Infinity)) continue
      t.fired++
      scheduleCall(sim, sim.elapsedMs + t.rule.atMs, t.rule)
    }
  }
}
