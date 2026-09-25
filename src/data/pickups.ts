import { PICKUPS as PICKUP_TABLE } from '../../defs/pickups'
import type { PickupDef, PickupId, PickupTable } from '../types/pickups'

const PT: PickupTable = PICKUP_TABLE

export const PICKUPS: Record<PickupId, PickupDef> = PICKUP_TABLE.defs
export const PICKUP = PT.pipeline
