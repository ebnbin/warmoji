import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { Call, Carrier, Due, Order } from '../components'
import { callRule, carrierPickup } from '../store'
import type { FieldPickupDef } from '../../types/battlefield'
import type { BatchRule, BossRule } from '../../types/runs'
import type { Sim } from '../sim'

/** 到 atMs 放出一只敌人：forced 为真必是精英，否则有 chance 的几率 */
export function scheduleOrder(sim: Sim, atMs: number, hpMul: number, forced: boolean, chance: number): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Due, Order)
  Due.at[eid] = atMs
  Order.hpMul[eid] = hpMul
  Order.forced[eid] = forced ? 1 : 0
  Order.chance[eid] = chance
  return eid
}

/** 到 atMs 一队敌人或头目登场 */
export function scheduleCall(sim: Sim, atMs: number, rule: BatchRule | BossRule): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Due, Call)
  Due.at[eid] = atMs
  callRule[eid] = rule
  return eid
}

export function scheduleCarrier(sim: Sim, atMs: number, pickup: FieldPickupDef): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Due, Carrier)
  Due.at[eid] = atMs
  carrierPickup[eid] = pickup
  return eid
}
