import { Alive, Buff, CharFlash, TeamDamage, Tint } from '../components'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

export function castBuffs(sim: Sim, scan = castScan): void {
  scan(sim, Buff, (e) => {
    TeamDamage.mul[sim.captain] = Buff.damageMul[e]!
    TeamDamage.until[sim.captain] = sim.elapsedMs + Buff.durationMs[e]!
    for (const m of sim.characters) {
      if (!Alive.v[m]) continue
      CharFlash.until[m] = sim.fxMs + 350
      Tint.color[m] = 0x80d8ff
      Tint.effect[m] = 0
    }
  })
}
