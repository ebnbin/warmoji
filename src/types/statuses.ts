import type statusesJson from '../assets/statuses.json'
import type { StatKey } from './stats'

export type StatusId = keyof typeof statusesJson

/** 状态能封住的动作：走、普通出手、施放技能、自己的位移、碰人 */
export type StatusAction = 'move' | 'act' | 'cast' | 'dash' | 'touch'

/** 状态逼着身体做的事：flee 背离施加者、approach 走向施加者，taunted 走向嘲讽者；同时有几条时 priority 小的先 */
export interface StatusForce {
  readonly kind: 'flee' | 'approach' | 'taunted'
  readonly pace: number
  readonly priority: number
}

/** 一种状态：身体上一条带时限的标记，规则都写在这里，按名字施加与判断 */
export interface StatusDef {
  readonly name: string
  /** 头顶显示的图标，emoji 码位；不写就不显示 */
  readonly icon?: string
  /** 控制：霸体挡它，施加霸体与净化时解掉它 */
  readonly cc?: true
  /** 不是控制、净化也解掉它 */
  readonly cleansable?: true
  readonly blocks?: readonly StatusAction[]
  readonly forces?: StatusForce
  /** 慢速乱逛的速度倍率：身上带着它的、会自己走的身体就这样走 */
  readonly wander?: number
  /** 把参数 a 当倍率乘进属性表的这一项；strongest 为真时同类只取最强的一条 */
  readonly stat?: { readonly key: StatKey; readonly strongest?: true }
  /** 按来源分开记：同一种、来源或定义不同的各占一格；否则同种同源只刷新 */
  readonly keyed?: true
  /** 槽位满时不被新的顶掉 */
  readonly pinned?: true
  /** 身上的底色：有几条时 rank 小的先 */
  readonly tint?: { readonly color: number; readonly rank: number }
  /** 谁也选不中、碰不到 */
  readonly untargetable?: true
  /** 看不见；揭示的状态让它失效 */
  readonly hidden?: true
  readonly reveals?: true
  /** 什么都落不到身上，持续伤害也不行 */
  readonly untouchable?: true
  /** 带伤害的一下落不到身上，持续伤害照样 */
  readonly invulnerable?: true
  /** 霸体：控制、被摆布、打断都不吃 */
  readonly steadfast?: true
  /** 倒戈：把自己人当敌人 */
  readonly turncoat?: true
  /** 停摆：姿态与产出都停住 */
  readonly halts?: true
  /** 用通用的状态效果施加成功后打断正在蓄的力与连发 */
  readonly interrupts?: true
}
