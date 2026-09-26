import { playSfx } from '../../audio/sfx'
import { Owner, Taunt } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import { castScan } from './shared/castScan'
import { spawnFxCircle } from '../entities/fx'
import type { Sim } from '../sim'

export function castTaunts(sim: Sim, scan = castScan): void {
  scan(sim, Taunt, (e) => {
    sim.taunt = { until: sim.elapsedMs + Taunt.durationMs[e]!, eid: Owner.eid[e]!, mul: Taunt.damageTakenMul[e]!, radius: Taunt.radius[e]! }
    playSfx('over')
    spawnFxCircle(sim, ownerX(e), ownerY(e), Taunt.radius[e]!, {
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
