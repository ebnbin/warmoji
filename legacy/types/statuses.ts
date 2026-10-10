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

/**
 * 同一种状态再上一次怎么并：high、low、rate 按强弱分格，强度一样的只刷新时长（取长的），不一样的各占一格、各自到期，生效时只取最强的一条——
 * high 是参数 a 越大越强，low 是越小越强，rate 是 a ÷ b 越大越强；bySource 按施加者分格，生效的是施加者还在的里面最晚到期的一条
 */
export type StatusMerge = 'high' | 'low' | 'rate' | 'bySource'

/** 自己画的图：冰块、护罩、光晕，与漫画符号（星、Z、心）和汗滴；不用 emoji，换画风也照样 */
export type LookCell = 'ice' | 'bubble' | 'glow' | 'star' | 'zee' | 'heart' | 'drop'

/** 从身上冒的粒子：火苗、毒泡、水滴、寒气、电火花、回春的光点、扬起的尘、引信的火星 */
export type LookPuff = 'flame' | 'toxic' | 'drip' | 'frost' | 'zap' | 'mend' | 'dust' | 'fuse'

/**
 * 状态在身上的样子，只认身体的画面大小与位置、不认画的是什么，换画风照样成立；什么都不写的是靠底色或行为就看得出来。
 * wrap 套在身上一层自己画的图，按身体的画面放大 scale 倍，behind 的垫在身体后面；emit 每隔 everyMs 从身上 from 处冒 count 粒，element 是冒标记里记着的那种元素的粒子；
 * comic 是头上的漫画符号：stars 绕头转，zzz 与 hearts 往上飘；shackle 是脚下拴着的一圈的颜色；guardArc 是身前格挡那道弧的颜色
 */
export interface StatusLook {
  readonly wrap?: { readonly cell: LookCell; readonly color: number; readonly alpha: number; readonly scale: number; readonly behind?: true }
  readonly emit?: { readonly puff: LookPuff | 'element'; readonly everyMs: number; readonly count: number; readonly from: 'body' | 'head' | 'feet' }
  readonly comic?: 'stars' | 'zzz' | 'hearts'
  readonly shackle?: number
  readonly guardArc?: number
}

/** 一种状态：身体上一条带时限的标记，规则都写在这里，按名字施加与判断 */
export interface StatusDef {
  readonly name: string
  /** 一句话说清它让身体怎样，图鉴的状态页用 */
  readonly desc: string
  /** 图鉴里的图标：emoji 码位，rank 小的在前；没有 look 的带时限时也暂时挂在头顶，同时最多三个 */
  readonly icon?: { readonly emoji: string; readonly rank: number }
  /** 在身上的样子：有它就不在头顶挂图标 */
  readonly look?: StatusLook
  /** 不写的同种只刷新时长（取长的），参数用新的 */
  readonly merge?: StatusMerge
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
