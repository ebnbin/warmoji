import type { BuffDef } from '../../../types/abilityDefs'
import { Alive, MFlash, Tint } from '../../components'
import { castScan } from '../systems/cast'
import { KindBuff } from '../tags'
import type { Sim } from '../../sim'

/** 限时全队增伤：不叠加，直接覆写，到期由 stepSim 复原；全队闪一下作到手反馈 */
export function castBuffs(sim: Sim): void {
  castScan<BuffDef>(sim, KindBuff, (_e, def) => {
    sim.skillDamageMul = def.damageMul
    sim.skillBuffUntil = sim.elapsedMs + def.durationMs
    for (const m of sim.members) {
      if (!Alive.v[m]) continue
      MFlash.until[m] = sim.elapsedMs + 350
      Tint.color[m] = 0x80d8ff
      Tint.effect[m] = 0
    }
  })
}
