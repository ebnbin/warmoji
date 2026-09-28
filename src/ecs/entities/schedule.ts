import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { Call, Carrier, Due, Order } from '../components'
import { callSpec, carrierPickup, foeSpec } from '../store'
import type { FieldPickupDef } from '../../types/battlefield'
import type { BossRule, LegacyBatchRule } from '../../types/runs'
import type { FoeSpec } from '../fight/state'
import type { Sim } from '../sim'

/** 到 atMs 按要求放出一只敌人 */
export function scheduleOrder(sim: Sim, atMs: number, spec: FoeSpec): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Due, Order)
  Due.at[eid] = atMs
  foeSpec[eid] = spec
  return eid
}

/** 到 atMs 一队敌人或头目登场；round 是一再放出的一队这是第几次，从 0 算 */
export function scheduleCall(sim: Sim, atMs: number, rule: LegacyBatchRule | BossRule, round = 0): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Due, Call)
  Due.at[eid] = atMs
  callSpec[eid] = { rule, round }
  return eid
}

export function scheduleCarrier(sim: Sim, atMs: number, pickup: FieldPickupDef): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Due, Carrier)
  Due.at[eid] = atMs
  carrierPickup[eid] = pickup
  return eid
}
