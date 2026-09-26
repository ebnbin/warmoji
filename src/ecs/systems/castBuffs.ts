import { Alive, Buff, CharFlash, DmgBuff, Tint } from '../components'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

/** 阵亡者也写一份，复活后享受剩余时长 */
export function castBuffs(sim: Sim, scan = castScan): void {
  scan(sim, Buff, (e) => {
    for (const m of sim.characters) {
      DmgBuff.mul[m] = Buff.damageMul[e]!
      DmgBuff.until[m] = sim.elapsedMs + Buff.durationMs[e]!
      if (!Alive.v[m]) continue
      CharFlash.until[m] = sim.fxMs + 350
      Tint.color[m] = 0x80d8ff
      Tint.effect[m] = 0
    }
  })
}
