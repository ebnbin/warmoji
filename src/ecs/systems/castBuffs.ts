import { Alive, Buff, CharFlash, TeamDamage, Tint } from '../components'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

/** 限时全队增伤：不叠加，直接覆写到队长的 TeamDamage；全队闪一下作到手反馈 */
export function castBuffs(sim: Sim): void {
  castScan(sim, Buff, (e) => {
    TeamDamage.mul[sim.captain] = Buff.damageMul[e]!
    TeamDamage.until[sim.captain] = sim.elapsedMs + Buff.durationMs[e]!
    for (const m of sim.characters) {
      if (!Alive.v[m]) continue
      CharFlash.until[m] = sim.elapsedMs + 350
      Tint.color[m] = 0x80d8ff
      Tint.effect[m] = 0
    }
  })
}
