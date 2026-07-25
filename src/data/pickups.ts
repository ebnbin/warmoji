import pickupsJson from '../assets/pickups.json'

// 拾取物（pickup）：战场上等待拾取的掉落实体（金币）。磁吸与拾取在 pickups/pickups.ts。
// 数据行在 defs/pickups.ts（创作层）。

export interface PickupDef {
  readonly emoji: string
  readonly size: number
  readonly radius: number
}

/** 拾取管线旋钮：磁吸与入账以队伍中心为基点，对全部拾取物统一生效
 *（磁吸范围下放到各队长 CaptainDef.coinMagnet，经 teamFx.magnetMul 叠乘） */
export interface PickupPipeline {
  /** 磁吸飞行速度（格/秒） */
  readonly magnetSpeed: number
  /** 入账半径（格） */
  readonly collectRadius: number
}

/** pickups.json 的整表形状：内容行 + 管线旋钮 */
export interface PickupTable {
  readonly defs: Record<string, PickupDef>
  readonly pipeline: PickupPipeline
}

const PT = pickupsJson as unknown as PickupTable

export type PickupId = keyof typeof pickupsJson.defs
export const PICKUPS = PT.defs as Record<PickupId, PickupDef>
export const PICKUP = PT.pipeline
