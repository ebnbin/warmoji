import { Alive, Iframe, CharFlash, CharHp, Rally, Tint } from '../components'
import { reviveCharacter } from './shared/combat'
import { ownerX, ownerY } from '../utils/amp'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'
import { spawnFxCircle } from '../entities/fx'

/** 无敌走受击无敌帧通道 */
export function castRallies(sim: Sim): void {
  castScan(sim, Rally, (e) => {
    for (const m of sim.characters) {
      if (!Alive.v[m]) reviveCharacter(sim, m)
      else CharHp.hp[m] = Math.min(CharHp.max[m]!, CharHp.hp[m]! + CharHp.max[m]! * Rally.healRatio[e]!)
      Iframe.last[m] = sim.elapsedMs + Rally.invulnMs[e]! - Iframe.ms[m]!
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
