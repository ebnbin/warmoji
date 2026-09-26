import { query } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { ENEMY_SET, Owner, Taunt, Taunted, Taunting, Transform } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import { castScan } from './shared/castScan'
import { spawnFxCircle } from '../entities/fx'
import type { Sim } from '../sim'

/** 嘲讽落在施法时圈内的每个敌人身上，之后进圈的不受影响 */
export function castTaunts(sim: Sim, scan = castScan): void {
  scan(sim, Taunt, (e) => {
    const m = Owner.eid[e]!
    const until = sim.elapsedMs + Taunt.durationMs[e]!
    const x = ownerX(e)
    const y = ownerY(e)
    const r = Taunt.radius[e]!
    Taunting.until[m] = until
    Taunting.mul[m] = Taunt.damageTakenMul[e]!
    for (const eid of query(sim.world, ENEMY_SET)) {
      const d = sim.hooks.worldDelta(sim, x, y, Transform.x[eid]!, Transform.y[eid]!)
      if (d.x * d.x + d.y * d.y > r * r) continue
      Taunted.until[eid] = until
      Taunted.by[eid] = m
    }
    playSfx('over')
    spawnFxCircle(sim, x, y, r, {
      fill: Taunt.color[e]!,
      fillAlpha: 0.18,
      stroke: Taunt.color[e]!,
      lineWidth: 5,
      lineAlpha: 0.9,
      fromScale: 0.2,
      toScale: 1,
      durationMs: 420,
      depth: 7,
    })
  })
}
