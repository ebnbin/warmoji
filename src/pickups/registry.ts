import pickupsJson from '../assets/pickups.json'

// 拾取物（pickup）：战场上等待拾取的掉落实体（金币）。磁吸与拾取在 pickups/pickups.ts。
// 数据行在 defs/pickups.ts（创作层）。

export interface PickupDef {
  readonly emoji: string
  readonly size: number
  readonly radius: number
}

export type PickupId = keyof typeof pickupsJson
export const PICKUPS = pickupsJson as unknown as Record<PickupId, PickupDef>

// 拾取管线旋钮：磁吸与入账以队伍中心为基点，对全部拾取物统一生效
//（拾取范围类道具挂队长，经 teamFx.magnetMul 叠乘）
export const PICKUP = {
  // 磁吸半径已下放到各队长（CaptainDef.coinMagnet）；此处仅留飞行/入账参数
  magnetSpeed: 8,
  collectRadius: 0.5,
} as const
