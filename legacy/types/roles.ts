import type rolesJson from '../assets/roles.json'
import type { Cond } from './abilityDefs'
import type { StatMods } from './stats'

export type RoleId = keyof typeof rolesJson

/**
 * 队员的本能：跟队时挑站的地方。engage 贴上离自己最近的敌人；guard 站到队长与离队长最近的敌人之间，离队长不超过 reach 格，敌人更近就贴上去；
 * dive 扑向自己 radius 格内生命比例最低、低于 ratio 的敌人；kite 坑位离敌人不到 distance 格就往外挪到 distance 格；tend 靠到生命比例最低、低于 ratio 的队友身边
 */
export type InstinctDef =
  | { readonly kind: 'engage' }
  | { readonly kind: 'guard'; readonly reach: number }
  | { readonly kind: 'dive'; readonly radius: number; readonly ratio: number }
  | { readonly kind: 'kite'; readonly distance: number }
  | { readonly kind: 'tend'; readonly ratio: number }

/** 一条本能：if 成立（target 是离自己最近的敌人，不写就总成立）、这种本能又挑得出地方，就站到那里；一条都不成就回坑位 */
export interface InstinctRule {
  readonly if?: Cond
  readonly do: InstinctDef
}

/** 角色定位：一组有得有失的属性修正与跟队时的本能，同定位的角色共用 */
export interface RoleDef {
  readonly name: string
  readonly stats: StatMods
  readonly instincts: readonly InstinctRule[]
}
