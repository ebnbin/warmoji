import { Alive, CharFlash, Hp, Rally, Tint } from '../components'
import { grantIframe, reviveCharacter } from './shared/combat'
import { ownerX, ownerY } from '../utils/amp'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'
import { spawnFxCircle } from '../entities/fx'

export function castRallies(sim: Sim, scan = castScan): void {
  scan(sim, Rally, (e) => {
    for (const m of sim.characters) {
      if (!Alive.v[m]) reviveCharacter(sim, m)
      else Hp.v[m] = Math.min(Hp.max[m]!, Hp.v[m]! + Hp.max[m]! * Rally.healRatio[e]!)
      grantIframe(sim, m, Rally.invulnMs[e]!)
      CharFlash.until[m] = sim.fxMs + 320
      Tint.color[m] = 0xffe082
      Tint.effect[m] = 0
    }
    spawnFxCircle(sim, ownerX(e), ownerY(e), Rally.ringRadius[e]!, {
        fill: Rally.color[e]!,
        fillAlpha: 0.3,
        stroke: Rally.color[e]!,
        lineWidth: 4,
        lineAlpha: 0.9,
        fromScale: 0.4,
        toScale: 3,
        durationMs: 550,
        depth: 20,
      })
  })
}
