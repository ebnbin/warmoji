import type statsJson from '../assets/stats.json'

export type StatKey = keyof typeof statsJson

/** 属性值的单位，决定怎么显示：count 整数、ratio 倍率、rate 冷却倍率（按攻速的倒数显示）、chance 概率、ms 毫秒、perSec 每秒、grid 格、gridPerSec 格每秒 */
export type StatUnit = 'count' | 'ratio' | 'rate' | 'chance' | 'ms' | 'perSec' | 'grid' | 'gridPerSec'

export interface StatDef {
  readonly name: string
  /** 身体没写基础值时取它 */
  readonly base: number
  readonly min?: number
  readonly max?: number
  readonly unit: StatUnit
}

export type StatValues = Record<StatKey, number>

/** 身体的基础值：没写的取属性目录里的默认值 */
export type StatBase = Partial<StatValues>

/** 对属性的修正：add 加在基础值上，mul 乘在结果上 */
export interface StatMods {
  readonly add?: StatBase
  readonly mul?: StatBase
}

/** 常驻修正的来源：装备与等级、精英、当前形态、复制来的、永久成长 */
export type StatLayer = 'gear' | 'elite' | 'form' | 'copy' | 'grow'
