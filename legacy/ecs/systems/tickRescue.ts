import { UNIT } from '../../util/units'
import { Alive, Transform } from '../components'
import { revivable, reviveCharacter } from './shared/combat'
import type { Sim } from '../sim'

/** 活着的队长站在倒下的 m 身边 reach 以内 */
export function rescuing(sim: Sim, m: number, reach: number): boolean {
  const lead = sim.leader
  const d = sim.hooks.worldDelta(sim, Transform.x[lead]!, Transform.y[lead]!, Transform.x[m]!, Transform.y[m]!)
  return Alive.v[lead] === 1 && d.x * d.x + d.y * d.y <= reach * reach
}

/** 救援：倒下又还能起来的队员身边一圈，活着的队长在圈里连续站满就把他扶起来，走开就从头算；按真实时间，和队伍同一个钟 */
export function tickRescue(sim: Sim): void {
  const f = sim.fight
  const r = f.rules.rescue
  if (!r || sim.over) return
  const reach = r.radius * UNIT
  sim.characters.forEach((m, slot) => {
    if (Alive.v[m] || !revivable(sim, m)) {
      f.rescueMs[slot] = 0
      return
    }
    f.rescueMs[slot] = rescuing(sim, m, reach) ? f.rescueMs[slot]! + sim.dtMs : 0
    if (f.rescueMs[slot]! < r.ms) return
    f.rescueMs[slot] = 0
    reviveCharacter(sim, m)
  })
}
