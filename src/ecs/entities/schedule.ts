import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { Carrier, Due, Surge } from '../components'
import { carrierPickup } from '../store'
import type { FieldPickupDef } from '../../types/battlefield'
import type { Sim } from '../sim'


export function scheduleSurge(sim: Sim, atMs: number, hpMul: number, forceElite: boolean): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Due, Surge)
  Due.at[eid] = atMs
  Surge.hpMul[eid] = hpMul
  Surge.forceElite[eid] = forceElite ? 1 : 0
  return eid
}

export function scheduleCarrier(sim: Sim, atMs: number, pickup: FieldPickupDef): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Due, Carrier)
  Due.at[eid] = atMs
  carrierPickup[eid] = pickup
  return eid
}
