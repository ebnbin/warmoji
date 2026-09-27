import { playSfx } from '../../audio/sfx'
import { UNIT } from '../../util/units'
import { Alive, Ring, Transform } from '../components'
import { holdSpot } from '../fight/state'
import { leaderX, leaderY } from '../utils/team'
import type { Sim } from '../sim'

const INSIDE_COLOR = 0x66bb6a
const OUTSIDE_COLOR = 0xffdc5d

/** 据点：活着的队长站在圈里就攒时间，这一处站满了圈挪到下一处 */
export function tickHold(sim: Sim): void {
  const h = sim.fight.hold
  if (!h || h.point >= h.rule.points.length || sim.over) return
  const spot = holdSpot(sim, h.rule.points[h.point]!)
  const r = h.rule.radius * UNIT
  const d = sim.hooks.worldDelta(sim, leaderX(sim), leaderY(sim), spot.x, spot.y)
  h.inside = Alive.v[sim.leader] === 1 && d.x * d.x + d.y * d.y <= r * r
  if (h.inside) h.heldMs += sim.wdtMs
  if (h.heldMs >= h.rule.ms / h.rule.points.length) {
    sim.out.bursts.push({ x: spot.x, y: spot.y, count: 16, kind: 'coin' })
    playSfx('upgrade')
    h.point++
    h.heldMs = 0
    h.inside = false
  }
  const ring = h.ring
  if (h.point >= h.rule.points.length) {
    Ring.lineAlpha[ring] = 0
    Ring.fillAlpha[ring] = 0
    return
  }
  const next = holdSpot(sim, h.rule.points[h.point]!)
  Transform.x[ring] = next.x
  Transform.y[ring] = next.y
  Ring.color[ring] = h.inside ? INSIDE_COLOR : OUTSIDE_COLOR
}
