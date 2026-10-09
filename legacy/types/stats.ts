import type statsJson from '../assets/stats.json'

export type StatKey = keyof typeof statsJson

/** 属性值的单位，决定怎么显示：count 整数、ratio 倍率、rate 冷却倍率（按攻速的倒数显示）、chance 概率、percent 百分比、ms 毫秒、perSec 每秒、grid 格、gridPerSec 格每秒 */
export type StatUnit = 'count' | 'ratio' | 'rate' | 'chance' | 'percent' | 'ms' | 'perSec' | 'grid' | 'gridPerSec'

/** 属性表里的分类：生存、输出、行动、经济、全场规则 */
export type StatCategory = 'survival' | 'offense' | 'mobility' | 'economy' | 'field'

/** 属性值往哪边变对持有者有利：higher 越大越好，lower 越小越好，neither 说不上好坏 */
export type StatBetter = 'higher' | 'lower' | 'neither'

export interface StatDef {
  readonly name: string
  /** 身体没写基础值时取它 */
  readonly base: number
  readonly min?: number
  readonly max?: number
  readonly unit: StatUnit
  readonly category: StatCategory
  readonly better: StatBetter
}

export type StatValues = Record<StatKey, number>

/** 身体的基础值：没写的取属性目录里的默认值 */
export type StatBase = Partial<StatValues>

/** 对属性的修正：add 加在基础值上；pct 是百分比，同一项的各条先相加，再按 1 + 合计乘上去；mul 各条连乘在结果上 */
export interface StatMods {
  readonly add?: StatBase
  readonly pct?: StatBase
  readonly mul?: StatBase
}

/** 常驻修正的来源：角色定位、装备与等级、精英、当前形态、头目阶段、复制来的、永久成长、这一场的规则、关卡给这一批敌人的 */
export type StatLayer = 'role' | 'gear' | 'elite' | 'form' | 'phase' | 'copy' | 'grow' | 'fight' | 'group'
