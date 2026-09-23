import { query } from 'bitecs'
import { Alive, Collected, GrantFlash, CharFlash, Tint } from '../components'
import type { Sim } from '../sim'

/** 须走受击闪光通道，否则只闪一帧 */
export function grantFlash(sim: Sim): void {
  for (const eid of query(sim.world, [Collected, GrantFlash])) {
    const color = GrantFlash.color[eid]!
    const until = sim.fxMs + GrantFlash.ms[eid]!
    for (const m of sim.characters) {
      if (!Alive.v[m]) continue
      CharFlash.until[m] = until
      Tint.color[m] = color
      Tint.effect[m] = 0
    }
  }
}
