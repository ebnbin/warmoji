import { query } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { Bob, Collected, PickupFx, Transform } from '../components'
import { pickupSfx } from '../store'
import type { Sim } from '../sim'

export function playPickupFx(sim: Sim): void {
  for (const eid of query(sim.world, [Collected, PickupFx, Transform])) {
    const y = Bob.amp[eid]! > 0 ? Bob.y0[eid]! : Transform.y[eid]!
    sim.out.bursts.push({ x: Transform.x[eid]!, y, count: PickupFx.burst[eid]!, kind: 'coin' })
    const sfx = pickupSfx[eid]
    if (sfx) playSfx(sfx)
  }
}
