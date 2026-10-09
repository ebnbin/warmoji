import type elementsJson from '../assets/elements.json'
import type { Effect } from './abilityDefs'
import type { StatusId } from './statuses'

/** 元素：单位与能力身上的属性，决定克制与元素反应 */
export type ElementId = keyof (typeof elementsJson)['list']

export interface ElementDef {
  readonly name: string
  readonly icon: string
  readonly color: number
  /** 克制谁：打它们伤害 × strong，被它们打 × weak */
  readonly beats: readonly ElementId[]
  /** 被这种元素打中后身上附着的状态 */
  readonly aura: StatusId
}

/** 元素反应：身上附着着一种元素时被另一种打中，消耗附着，这一下伤害 × mul，再由出手方对被打中的身体施加 effects（不带元素） */
export interface ElementReaction {
  readonly name: string
  readonly desc: string
  readonly of: readonly [ElementId, ElementId]
  readonly mul?: number
  readonly effects?: readonly Effect[]
  /** 反应时在被打中的身体上闪一圈的颜色 */
  readonly color: number
}

/** 元素的整套规则：克制倍率（克制、被克、同元素）、附着多久、有哪些元素与反应 */
export interface ElementRules {
  readonly mul: { readonly strong: number; readonly weak: number; readonly same: number }
  readonly auraMs: number
  readonly list: Readonly<Record<string, ElementDef>>
  readonly reactions: Readonly<Record<string, ElementReaction>>
}
