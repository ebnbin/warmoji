import { query } from 'bitecs'
import { UNIT } from '../../util/units'
import { FACTION, Faction, March, Transform } from '../components'
import { phaseOf } from '../fight/state'
import { marchMark } from '../store'
import { despawnEnemy } from './shared/combat'
import type { Sim } from '../sim'

/** 漏怪：朝这一组地标行进的敌人走进圈里就离场，不算击杀，记漏过一只 */
export function tickLeaks(sim: Sim): void {
  if (sim.over) return
  const f = sim.fight
  phaseOf(f).ends.forEach((e, i) => {
    if (e.kind !== 'leak') return
    const marks = sim.hooks.landmarks(sim)[e.mark] ?? []
    const r = e.radius * UNIT
    for (const eid of [...query(sim.world, [March, Transform])]) {
      if (Faction.v[eid] !== FACTION.enemy || marchMark[eid] !== e.mark) continue
      const x = Transform.x[eid]!
      const y = Transform.y[eid]!
      const reached = marks.some((m) => {
        const d = sim.hooks.worldDelta(sim, x, y, m.x, m.y)
        return d.x * d.x + d.y * d.y <= r * r
      })
      if (!reached) continue
      f.goals[i]!.leaked++
      despawnEnemy(sim, eid)
    }
  })
}
