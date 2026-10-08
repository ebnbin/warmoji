import { UNIT } from '../../util/units'
import { Alive } from '../components'
import { phaseOf, visitNeed } from '../fight/state'
import { leaderX, leaderY } from '../utils/team'
import type { Sim } from '../sim'

/** 到访：活着的队长站进一处还没到过的地标的圈里就攒时间，走开就从头算，站满算到过这一处 */
export function tickVisits(sim: Sim): void {
  if (sim.over) return
  const f = sim.fight
  phaseOf(f).ends.forEach((e, i) => {
    if (e.kind !== 'visit') return
    const g = f.goals[i]!
    if (g.done.size >= visitNeed(sim, e)) return
    const marks = sim.hooks.landmarks(sim)[e.mark] ?? []
    const r = e.radius * UNIT
    const here = Alive.v[sim.leader]
      ? marks.findIndex((m, k) => {
          if (g.done.has(k)) return false
          const d = sim.hooks.worldDelta(sim, leaderX(sim), leaderY(sim), m.x, m.y)
          return d.x * d.x + d.y * d.y <= r * r
        })
      : -1
    if (here !== g.at) {
      g.at = here
      g.ms = 0
    }
    if (here < 0) return
    g.ms += sim.wdtMs
    if (g.ms < e.ms) return
    const m = marks[here]!
    sim.out.bursts.push({ x: m.x, y: m.y, count: 16, kind: 'coin' })
    sim.out.events.push({ kind: 'goal' })
    g.done.add(here)
    g.at = -1
    g.ms = 0
  })
}
