import { query, removeEntity } from 'bitecs'
import { Carrier, Due } from '../components'
import { spawnCarrierEcs } from '../entities/enemy'
import { carrierPickup } from '../store'
import type { Sim } from '../sim'

/** 携带者排期到点：挂一只带战场拾取的敌人（场上过挤则本次跳过，与旧实现同） */
export function fireCarriers(sim: Sim): void {
  for (const eid of [...query(sim.world, [Due, Carrier])]) {
    if (sim.elapsedMs < Due.at[eid]!) continue
    spawnCarrierEcs(sim, carrierPickup[eid]!)
    removeEntity(sim.world, eid)
  }
}
