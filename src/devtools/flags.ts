import { devSettings, updateDevSettings } from './settings'
import type { DevChoiceItem, DevOption, DevToggleItem } from './types'

/** 存下来的开发开关：调用即读当前值，item 由定义它的那一层摆进自己的页签 */
export interface DevFlag {
  (): boolean
  readonly item: DevToggleItem
}

export interface DevChoice<T extends string> {
  (): T
  readonly item: DevChoiceItem
}

interface FlagDef {
  readonly id: string
  readonly label: string
  readonly desc?: string
  readonly default?: boolean
}

interface ChoiceDef<T extends string> {
  readonly id: string
  readonly label: string
  readonly desc?: string
  readonly options: readonly (DevOption & { readonly id: T })[]
  readonly default: T
}

const ids = new Set<string>()

function claim(id: string): void {
  if (ids.has(id)) throw new Error(`开发开关 id 重复：${id}`)
  ids.add(id)
}

export function devFlag(def: FlagDef): DevFlag {
  claim(def.id)
  const on = (): boolean => devSettings().flags[def.id] ?? def.default ?? false
  const item: DevToggleItem = {
    kind: 'toggle',
    label: def.label,
    desc: def.desc,
    get: on,
    set: (v) => updateDevSettings({ flags: { ...devSettings().flags, [def.id]: v } }),
  }
  return Object.assign(on, { item })
}

/** 存下的值不在选项里时回到默认 */
export function devChoice<T extends string>(def: ChoiceDef<T>): DevChoice<T> {
  claim(def.id)
  const get = (): T => {
    const v = devSettings().choices[def.id]
    return def.options.find((o) => o.id === v)?.id ?? def.default
  }
  const item: DevChoiceItem = {
    kind: 'choice',
    label: def.label,
    desc: def.desc,
    options: def.options,
    get,
    set: (id) => updateDevSettings({ choices: { ...devSettings().choices, [def.id]: id } }),
  }
  return Object.assign(get, { item })
}
