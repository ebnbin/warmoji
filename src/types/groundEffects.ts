import type { Effect } from './abilityDefs'

/** 场的对象与判定：who 是节拍、到期与停留的效果施于谁（伤害只打敌方）；onExpire 到期时施于场内；dwell 连续待满 ms 施加一次；pull 每秒把场内敌方往圆心带多远；traction 是场内地面的抓地倍率（谁都算）；mist 让场内己方只能被同在场内的出手打到；trap 让场等着，第一个敌方踏进来就对场内敌方结算一次后消失 */
export interface ZoneRules {
  readonly who?: 'foes' | 'allies' | 'all'
  readonly onExpire?: readonly Effect[]
  readonly dwell?: { readonly ms: number; readonly effects: readonly Effect[] }
  readonly pull?: number
  readonly traction?: number
  readonly mist?: boolean
  readonly trap?: boolean
}

/** 每次节拍先扣 damage 再施加 effects */
export interface GroundEffectDef extends ZoneRules {
  readonly radius: number
  readonly durationMs: number
  readonly tickMs: number
  readonly damage: number
  readonly color: number
  readonly fillAlpha: number
  readonly lineAlpha: number
  readonly enterMs: number
  readonly effects?: readonly Effect[]
}
