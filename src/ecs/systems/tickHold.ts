import { UNIT } from '../../util/units'
import { Alive } from '../components'
import { holdSpot } from '../fight/state'
import { leaderX, leaderY } from '../utils/team'
import type { Sim } from '../sim'

/** 据点：活着的队长站在圈里就攒时间，这一处站满了换到下一处；地标上的据点那一处此刻没有就不攒 */
export function tickHold(sim: Sim): void {
  const h = sim.fight.hold
  if (!h || h.point >= h.rule.points.length || sim.over) return
  const spot = holdSpot(sim, h.rule.points[h.point]!)
  if (!spot) {
    h.inside = false
    return
  }
  const r = h.rule.radius * UNIT
  const d = sim.hooks.worldDelta(sim, leaderX(sim), leaderY(sim), spot.x, spot.y)
  h.inside = Alive.v[sim.leader] === 1 && d.x * d.x + d.y * d.y <= r * r
  if (h.inside) h.heldMs += sim.wdtMs
  if (h.heldMs < h.rule.ms / h.rule.points.length) return
  sim.out.bursts.push({ x: spot.x, y: spot.y, count: 16, kind: 'coin' })
  sim.out.sfx.push('upgrade')
  h.point++
  h.heldMs = 0
  h.inside = false
}
