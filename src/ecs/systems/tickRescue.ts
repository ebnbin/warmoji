import { removeEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { Alive, Ring, Transform } from '../components'
import { spawnGroundRing } from '../entities/groundRing'
import { revivable, reviveCharacter } from './shared/combat'
import type { Sim } from '../sim'

const WAITING_COLOR = 0xffdc5d
const RESCUING_COLOR = 0x66bb6a

/** 救援：倒下又还能起来的队员身边一圈，活着的队长在圈里连续站满就把他扶起来，走开就从头算；按真实时间，和队伍同一个钟 */
export function tickRescue(sim: Sim): void {
  const f = sim.fight
  const r = f.rules.rescue
  if (!r || sim.over) return
  const lead = sim.leader
  const reach = r.radius * UNIT
  sim.characters.forEach((m, slot) => {
    const ring = f.rescueRings[slot]!
    if (Alive.v[m] || !revivable(sim, m)) {
      f.rescueMs[slot] = 0
      if (ring >= 0) removeEntity(sim.world, ring)
      f.rescueRings[slot] = -1
      return
    }
    const d = sim.hooks.worldDelta(sim, Transform.x[lead]!, Transform.y[lead]!, Transform.x[m]!, Transform.y[m]!)
    const inside = Alive.v[lead] === 1 && d.x * d.x + d.y * d.y <= reach * reach
    f.rescueMs[slot] = inside ? f.rescueMs[slot]! + sim.dtMs : 0
    const eid = ring >= 0 ? ring : spawnGroundRing(sim, { x: Transform.x[m]!, y: Transform.y[m]! }, reach)
    f.rescueRings[slot] = eid
    Transform.x[eid] = Transform.x[m]!
    Transform.y[eid] = Transform.y[m]!
    Ring.color[eid] = inside ? RESCUING_COLOR : WAITING_COLOR
    if (f.rescueMs[slot]! < r.ms) return
    f.rescueMs[slot] = 0
    reviveCharacter(sim, m)
  })
}
