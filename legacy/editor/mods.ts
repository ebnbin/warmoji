import { addValue, STAT_CATEGORIES, STAT_KEYS, STATS } from '../data/stats'
import type { StatKey, StatMods, StatUnit } from '../types/stats'
import { keysOf } from '../util/record'
import type { Mutable } from './draft'
import { ICON } from './kinds'
import { actions, heading, info, num } from './rows'
import type { Range, Row } from './rows'

type Layer = keyof StatMods

/** 加值按属性的单位给范围与初值 */
const ADD: { readonly [U in StatUnit]: { readonly range: Omit<Range, 'format'>; readonly start: number } } = {
  count: { range: { min: -200, max: 200, step: 1 }, start: 1 },
  ratio: { range: { min: -2, max: 2, step: 0.05 }, start: 0.1 },
  rate: { range: { min: -2, max: 2, step: 0.05 }, start: 0.1 },
  chance: { range: { min: -1, max: 1, step: 0.05 }, start: 0.1 },
  percent: { range: { min: -1, max: 1, step: 0.05 }, start: 0.1 },
  ms: { range: { min: -10_000, max: 10_000, step: 50 }, start: 500 },
  perSec: { range: { min: -100, max: 100, step: 0.5 }, start: 1 },
  grid: { range: { min: -20, max: 20, step: 0.1 }, start: 1 },
  gridPerSec: { range: { min: -20, max: 20, step: 0.1 }, start: 1 },
}

/** 三种修正：加值加在基础值上，百分比先相加再乘上去，倍率连乘 */
const LAYERS: { readonly [L in Layer]: { readonly name: string; readonly range: (k: StatKey) => Range; readonly start: (k: StatKey) => number } } = {
  add: {
    name: '加值',
    range: (k) => ({ ...ADD[STATS[k].unit].range, format: (v) => addValue(k, v) }),
    start: (k) => ADD[STATS[k].unit].start,
  },
  pct: {
    name: '百分比',
    range: () => ({ min: -1, max: 5, step: 0.05, format: (v) => `${v < 0 ? '' : '+'}${Math.round(v * 100)}%` }),
    start: () => 0.2,
  },
  mul: {
    name: '倍率',
    range: () => ({ min: 0, max: 10, step: 0.05, format: (v) => `× ${v}` }),
    start: () => 1.5,
  },
}

/** 一组属性修正：逐条调值或删掉，按三种算法各加一条；删空了就整组去掉 */
export function modsRows(label: string, mods: Mutable<StatMods> | undefined, set: (m: Mutable<StatMods> | undefined) => void, hint: string): Row[] {
  const layers = keysOf(LAYERS)
  const entries = layers.flatMap((layer) => keysOf(mods?.[layer] ?? {}).map((k) => ({ layer, k, v: mods![layer]![k]! })))
  const drop = (layer: Layer, k: StatKey): void => {
    const m = mods!
    const row = m[layer]!
    delete row[k]
    if (keysOf(row).length === 0) delete m[layer]
    set(keysOf(m).length > 0 ? m : undefined)
  }
  const add = (layer: Layer, k: StatKey): void => {
    const m = mods ?? {}
    ;(m[layer] ??= {})[k] = LAYERS[layer].start(k)
    set(m)
  }
  return [
    heading(label),
    ...(entries.length === 0 ? [info('没有修正', undefined, { hint })] : []),
    ...entries.map(({ layer, k, v }) =>
      num(STATS[k].name, v, LAYERS[layer].range(k), (x) => (mods![layer]![k] = x), {
        icon: STAT_CATEGORIES[STATS[k].category].icon,
        hint: LAYERS[layer].name,
        tools: [{ icon: ICON.remove, run: () => drop(layer, k) }],
      }),
    ),
    actions(
      layers.map((layer) => ({
        kind: 'menu' as const,
        label: `+ ${LAYERS[layer].name}`,
        role: 'add' as const,
        title: `加一条${LAYERS[layer].name}`,
        options: STAT_KEYS.filter((k) => mods?.[layer]?.[k] === undefined).map((k) => ({ emoji: STAT_CATEGORIES[STATS[k].category].icon, label: STATS[k].name, run: () => add(layer, k) })),
      })),
    ),
  ]
}
