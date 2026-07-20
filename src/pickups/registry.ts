import pickupsJson from '../assets/pickups.json'

// 拾取物（pickup）：战场上等待拾取的掉落实体（金币/宝箱）。同组同管线
// 磁吸与拾取（battle/pickups.ts，data 标记分流）；掉率/开箱抽取是掉落
// 经济逻辑，在 run/chest.ts。数据行在 defs/pickups.ts（创作层）。

export interface PickupDef {
  readonly emoji: string
  readonly size: number
  readonly radius: number
  /** 宝箱兜底金币：全队所有道具池都抽无可抽时（几乎不可能）改吐金币 */
  readonly fallbackCoins?: number
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
