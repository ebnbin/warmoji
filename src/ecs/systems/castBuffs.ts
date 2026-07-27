import { Alive, Buff, CharFlash, Tint } from '../components'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

/** 限时全队增伤：不叠加，直接覆写，到期由 stepSim 复原；全队闪一下作到手反馈 */
export function castBuffs(sim: Sim): void {
  castScan(sim, Buff, (e) => {
    sim.skillDamageMul = Buff.damageMul[e]!
    sim.skillBuffUntil = sim.elapsedMs + Buff.durationMs[e]!
    for (const m of sim.characters) {
      if (!Alive.v[m]) continue
      CharFlash.until[m] = sim.elapsedMs + 350
      Tint.color[m] = 0x80d8ff
      Tint.effect[m] = 0
    }
  })
}
