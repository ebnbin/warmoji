import { query } from 'bitecs'
import { Alive, Collected, GrantFlash, Uid } from '../components'
import type { Sim } from '../sim'

/** 捡到会让全队一闪的道具：每个活着的队员亮一下 */
export function grantFlash(sim: Sim): void {
  for (const eid of query(sim.world, [Collected, GrantFlash])) {
    const color = GrantFlash.color[eid]!
    const ms = GrantFlash.ms[eid]!
    for (const m of sim.characters) {
      if (Alive.v[m]) sim.out.events.push({ kind: 'glow', eid: m, uid: Uid.v[m]!, color, ms, fxAt: sim.fxMs })
    }
  }
}
