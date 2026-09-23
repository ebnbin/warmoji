import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { Carrier, Due, Surge } from '../components'
import { carrierPickup } from '../store'
import type { FieldPickupDef } from '../../types/battlefield'
import type { Sim } from '../sim'


/** 排一次敌潮出怪（到点才求落点与出怪表） */
export function scheduleSurge(sim: Sim, atMs: number, hpMul: number, forceElite: boolean): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Due, Surge)
  Due.at[eid] = atMs
  Surge.hpMul[eid] = hpMul
  Surge.forceElite[eid] = forceElite ? 1 : 0
  return eid
}

/** 排一名携带者上场（到点才挑怪求落点） */
export function scheduleCarrier(sim: Sim, atMs: number, pickup: FieldPickupDef): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Due, Carrier)
  Due.at[eid] = atMs
  carrierPickup[eid] = pickup
  return eid
}
