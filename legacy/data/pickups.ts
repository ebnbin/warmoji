import pickupsJson from '../assets/pickups.json'
import { fromJson } from './json'
import type { PickupDef, PickupId, PickupTable } from '../types/pickups'

const PT = fromJson<PickupTable>(pickupsJson)

export const PICKUPS = fromJson<Record<PickupId, PickupDef>>(pickupsJson.defs)
export const PICKUP = PT.pipeline
