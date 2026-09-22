import pickupsJson from '../assets/pickups.json'

export interface PickupDef {
  readonly emoji: string
  readonly size: number
  readonly radius: number
}
/** 以队伍中心为基点；磁吸范围 = CaptainDef.coinMagnet × teamFx.magnetMul */
export interface PickupPipeline {
  /** 磁吸飞行速度（格/秒） */
  readonly magnetSpeed: number
  /** 入账半径（格） */
  readonly collectRadius: number
}
export interface PickupTable {
  readonly defs: Record<string, PickupDef>
  readonly pipeline: PickupPipeline
}
export type PickupId = keyof typeof pickupsJson.defs
