import { query } from 'bitecs'
import { Alive, Collected, GrantFlash, MFlash, Tint } from '../components'
import type { Sim } from '../sim'

/** 到手反馈：全队闪一下极性色。走受击闪光同一通道——否则队员视觉每帧把染色抹回常态，
 * 只闪得到一帧 */
export function grantFlash(sim: Sim): void {
  for (const eid of query(sim.world, [Collected, GrantFlash])) {
    const color = GrantFlash.color[eid]!
    const until = sim.elapsedMs + GrantFlash.ms[eid]!
    for (const m of sim.members) {
      if (!Alive.v[m]) continue
      MFlash.until[m] = until
      Tint.color[m] = color
      Tint.effect[m] = 0
    }
  }
}
