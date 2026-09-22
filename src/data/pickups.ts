import pickupsJson from '../assets/pickups.json'
import type { PickupDef, PickupId, PickupTable } from '../types/pickups'

const PT = pickupsJson as unknown as PickupTable

export const PICKUPS = PT.defs as Record<PickupId, PickupDef>
export const PICKUP = PT.pipeline
