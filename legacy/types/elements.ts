import type elementsJson from '../assets/elements.json'
import type { EntranceLook } from './maps'

/** 元素：一下伤害带的、一个身体本身是的；不带元素的一下是物理 */
export type ElementId = keyof (typeof elementsJson)['list']

export interface ElementDef {
  readonly name: string
  readonly icon: string
  readonly color: number
  /** 一句话说清打中会怎样 */
  readonly desc: string
  /** 身体本身是这种元素时免疫什么、天生怎样 */
  readonly body: string
  /** 被这种元素打倒的样子：迸出的粒子与碎片染的颜色 */
  readonly fall: { readonly burst: EntranceLook; readonly tint: number }
}

/** 元素反应：在被打中处闪一圈、迸出粒子、飘出名字 */
export interface ElementReaction {
  readonly name: string
  readonly desc: string
  readonly color: number
  readonly burst: EntranceLook
}

/** 元素的整套规则：有哪些元素、各自留在身上的状态怎么算、几种反应；长度以格为单位 */
export interface ElementRules {
  readonly list: Readonly<Record<string, ElementDef>>
  /** 燃烧：每 tickMs 掉点燃那一下 ratio 倍的血，烧 durationMs，再点跳伤取大的；每跳一次烧到身体边缘相距 spread 格以内、没在烧的同伴，烧过去的只烧剩下的时间 */
  readonly burn: { readonly ratio: number; readonly tickMs: number; readonly durationMs: number; readonly spread: number }
  /** 寒冷：每挨一下冰加一层，移速 × slow，ms 内不再挨冰就散；叠到 stacks 层冻住 frozenMs */
  readonly chill: { readonly stacks: number; readonly ms: number; readonly slow: number; readonly frozenMs: number }
  /** 电：打断挨打的出手，再跳到 radius 格内离它最近的另一个敌人，吃这一下 ratio 倍 */
  readonly shock: { readonly radius: number; readonly ratio: number }
  /** 湿：浇湿 ms */
  readonly wet: { readonly ms: number }
  /** 中毒：每挨一下毒加一层，每层每 tickMs 掉那一下 ratio 倍的血，最多 stacks 层（满了以后比平均一层强的顶掉平均的一层），durationMs 内不再中毒就解 */
  readonly poison: { readonly ratio: number; readonly tickMs: number; readonly durationMs: number; readonly stacks: number }
  readonly reactions: {
    /** 物理打冻住的：这一下伤害 × (1 + ratio)，解冻 */
    readonly shatter: ElementReaction & { readonly ratio: number }
    /** 火打冻住或发冷的：解冻、散掉寒冷，不点燃 */
    readonly thaw: ElementReaction
    /** 水或冰打烧着的、火打湿的：灭火、蒸干 */
    readonly quench: ElementReaction
    /** 冰打湿的：当场冻住 */
    readonly flashFreeze: ElementReaction
    /** 雷打湿的：radius 格内别的湿的敌人各吃这一下 ratio 倍 */
    readonly conduct: ElementReaction & { readonly radius: number; readonly ratio: number }
    /** 火打在毒云里的：毒云炸开，云里的敌人各吃这一下 ratio 倍 */
    readonly ignite: ElementReaction & { readonly ratio: number }
  }
}

export type ReactionId = keyof ElementRules['reactions']
