import type { PICKUPS } from '../../defs/pickups'

export interface PickupDef {
  readonly emoji: string
  readonly size: number
  readonly radius: number
}
interface PickupPipeline {
  readonly magnetSpeed: number
  readonly collectRadius: number
}
export interface PickupTable {
  readonly defs: Record<string, PickupDef>
  readonly pipeline: PickupPipeline
}
export type PickupId = keyof typeof PICKUPS.defs
