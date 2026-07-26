import pickupsJson from '../assets/pickups.json'
import type { PickupDef, PickupId, PickupTable } from '../types/pickups'

// 拾取物（pickup）：战场上等待拾取的掉落实体（金币）。磁吸与拾取在 pickups/pickups.ts。
// 数据行在 defs/pickups.ts（创作层）。

const PT = pickupsJson as unknown as PickupTable

export const PICKUPS = PT.defs as Record<PickupId, PickupDef>
export const PICKUP = PT.pipeline
