import statsJson from '../assets/stats.json'
import { fromJson } from './json'
import { keysOf } from '../util/record'
import type { StatBase, StatDef, StatKey, StatMods, StatUnit, StatValues } from '../types/stats'

export const STATS = fromJson<Record<StatKey, StatDef>>(statsJson)

export const STAT_KEYS: readonly StatKey[] = keysOf(STATS)

const INDEX = Object.fromEntries(STAT_KEYS.map((k, i) => [k, i])) as Record<StatKey, number>

function clamp(k: StatKey, v: number): number {
  const d = STATS[k]
  return Math.min(d.max ?? Infinity, Math.max(d.min ?? -Infinity, v))
}

/** 汇总一张属性表：从基础值起，加值相加、倍率相乘，只取最强一条的倍率（减速）另外相乘，最后按上下限夹住 */
export class StatFold {
  private readonly sum = new Float64Array(STAT_KEYS.length)
  private readonly mul = new Float64Array(STAT_KEYS.length)
  private readonly low = new Float64Array(STAT_KEYS.length)

  start(base: StatBase | undefined): void {
    for (let i = 0; i < STAT_KEYS.length; i++) {
      const k = STAT_KEYS[i]!
      this.sum[i] = base?.[k] ?? STATS[k].base
      this.mul[i] = 1
      this.low[i] = 1
    }
  }

  apply(m: StatMods): void {
    if (m.add) for (const k in m.add) this.plus(k as StatKey, m.add[k as StatKey]!)
    if (m.mul) for (const k in m.mul) this.times(k as StatKey, m.mul[k as StatKey]!)
  }

  plus(k: StatKey, v: number): void {
    const i = INDEX[k]
    this.sum[i] = this.sum[i]! + v
  }

  times(k: StatKey, v: number): void {
    const i = INDEX[k]
    this.mul[i] = this.mul[i]! * v
  }

  /** 同类只取最强的一条 */
  strongest(k: StatKey, v: number): void {
    const i = INDEX[k]
    this.low[i] = Math.min(this.low[i]!, v)
  }

  value(i: number): number {
    return clamp(STAT_KEYS[i]!, this.sum[i]! * this.mul[i]! * this.low[i]!)
  }
}

const scratch = new StatFold()

/** 战斗外的属性表：基础值加上常驻修正，商店与图鉴按它显示 */
export function foldStats(base: StatBase | undefined, mods: readonly StatMods[]): StatValues {
  scratch.start(base)
  for (const m of mods) scratch.apply(m)
  const out = {} as StatValues
  STAT_KEYS.forEach((k, i) => {
    out[k] = scratch.value(i)
  })
  return out
}

const num = (v: number, digits = 2): string => `${+v.toFixed(digits)}`

function valueText(unit: StatUnit, v: number): string {
  switch (unit) {
    case 'count':
      return `${Math.round(v)}`
    case 'ratio':
      return `×${num(v)}`
    case 'rate':
      return `×${num(1 / v)}`
    case 'chance':
    case 'percent':
      return `${Math.round(v * 100)}%`
    case 'ms':
      return `${num(v / 1000)}秒`
    case 'perSec':
      return `${num(v, 1)}/秒`
    case 'grid':
      return `${num(v, 1)}格`
    case 'gridPerSec':
      return `${num(v, 1)}格/秒`
  }
}

function addText(unit: StatUnit, v: number): string {
  const sign = v < 0 ? '-' : '+'
  const a = Math.abs(v)
  switch (unit) {
    case 'ratio':
    case 'chance':
    case 'percent':
      return `${sign}${Math.round(a * 100)}%`
    case 'ms':
      return `${sign}${num(a / 1000)}秒`
    case 'perSec':
      return `${sign}${num(a, 1)}/秒`
    case 'grid':
      return `${sign}${num(a, 1)}格`
    case 'gridPerSec':
      return `${sign}${num(a, 1)}格/秒`
    default:
      return `${sign}${num(a)}`
  }
}

/** 一项属性的值按单位写成文字，如"×1.15""40%""6格/秒" */
export function statValue(k: StatKey, v: number): string {
  return valueText(STATS[k].unit, v)
}

/** 一项属性的名字加值，如"生命上限 100""攻速 ×1.15" */
export function statText(k: StatKey, v: number): string {
  return `${STATS[k].name} ${statValue(k, v)}`
}

/** 倍率写成涨跌的百分比，冷却倍率按攻速的涨跌写 */
function mulText(unit: StatUnit, v: number): string {
  const d = (unit === 'rate' ? 1 / v : v) - 1
  return `${d < 0 ? '-' : '+'}${Math.round(Math.abs(d) * 100)}%`
}

/** 一组修正逐条的文字，如"生命上限 +25""攻速 +15%" */
export function modTexts(m: StatMods): string[] {
  const out: string[] = []
  const add = m.add ?? {}
  const mul = m.mul ?? {}
  for (const k of keysOf(add)) out.push(`${STATS[k].name} ${addText(STATS[k].unit, add[k]!)}`)
  for (const k of keysOf(mul)) out.push(`${STATS[k].name} ${mulText(STATS[k].unit, mul[k]!)}`)
  return out
}
