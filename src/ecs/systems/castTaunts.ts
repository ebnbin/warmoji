import { playSfx } from '../../audio/sfx'
import { Guard, Owner, Taunt, Taunted } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import { sourceOf } from '../utils/source'
import { targetsNear } from '../utils/targets'
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
    Guard.until[m] = until
    Guard.mul[m] = Taunt.damageTakenMul[e]!
    for (const t of targetsNear(sim, sourceOf(sim, e), x, y, r)) {
      Taunted.until[t.eid] = until
      Taunted.by[t.eid] = m
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
