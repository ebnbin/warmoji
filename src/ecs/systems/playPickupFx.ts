import { query } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { Collected, PickupFx, Transform } from '../components'
import { pickupSfx } from '../store'
import type { Sim } from '../sim'

/** 到手的爆点与音效。它与各 Grant 正交：既给钱又给增益的拾取物也只爆一次 */
export function playPickupFx(sim: Sim): void {
  for (const eid of query(sim.world, [Collected, PickupFx, Transform])) {
    sim.pendingBursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: PickupFx.burst[eid]!, kind: 'coin' })
    const sfx = pickupSfx[eid]
    if (sfx) playSfx(sfx)
  }
}
