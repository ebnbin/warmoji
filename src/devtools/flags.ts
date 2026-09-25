import { refreshDevPanel } from './registry'
import { devSettings, updateDevSettings } from './settings'
import type { DevItem, DevOption, DevToggleItem } from './types'

export interface DevFlagDef {
  readonly id: string
  readonly label: string
  readonly desc?: string
  readonly group?: string
  readonly default?: boolean
}

export interface DevChoiceDef {
  readonly id: string
  readonly label: string
  readonly desc?: string
  readonly group?: string
  readonly options: readonly DevOption[]
  readonly default: string
}

const flagDefs = new Map<string, DevFlagDef>()
const choiceDefs = new Map<string, DevChoiceDef>()

export function devFlag(id: string): boolean {
  const def = flagDefs.get(id)
  return devSettings().flags[id] ?? def?.default ?? false
}

export function setDevFlag(id: string, on: boolean): void {
  updateDevSettings({ flags: { ...devSettings().flags, [id]: on } })
}

/** 业务用返回的读取函数在任意位置分支；开关自动出现在"开关"页签并持久化 */
export function defineDevFlag(def: DevFlagDef): () => boolean {
  if (flagDefs.has(def.id)) throw new Error(`devtools 开关 id 重复：${def.id}`)
  flagDefs.set(def.id, def)
  refreshDevPanel()
  return () => devFlag(def.id)
}

/** 让 provider 把自己的开关放进自己的页签 */
export function devFlagItem(id: string): DevToggleItem {
  const def = flagDefs.get(id)
  if (!def) throw new Error(`devtools 开关未定义：${id}`)
  return { kind: 'toggle', label: def.label, desc: def.desc, get: () => devFlag(id), set: (on) => setDevFlag(id, on) }
}

export function devChoice(id: string): string {
  const def = choiceDefs.get(id)
  const v = devSettings().choices[id]
  if (def && v !== undefined && def.options.some((o) => o.id === v)) return v
  return def?.default ?? ''
}

export function setDevChoice(id: string, value: string): void {
  updateDevSettings({ choices: { ...devSettings().choices, [id]: value } })
}

export function defineDevChoice(def: DevChoiceDef): () => string {
  if (choiceDefs.has(def.id)) throw new Error(`devtools 选项 id 重复：${def.id}`)
  choiceDefs.set(def.id, def)
  refreshDevPanel()
  return () => devChoice(def.id)
}

const withGroup = (group: string | undefined, label: string): string => (group ? `${group} · ${label}` : label)

export function flagItems(): DevItem[] {
  const items: DevItem[] = []
  for (const def of flagDefs.values()) {
    items.push({
      kind: 'toggle',
      label: withGroup(def.group, def.label),
      desc: def.desc,
      get: () => devFlag(def.id),
      set: (on) => setDevFlag(def.id, on),
    })
  }
  for (const def of choiceDefs.values()) {
    items.push({
      kind: 'choice',
      label: withGroup(def.group, def.label) + (def.desc ? ` · ${def.desc}` : ''),
      options: def.options,
      get: () => devChoice(def.id),
      set: (id) => setDevChoice(def.id, id),
    })
  }
  if (items.length === 0) items.push({ kind: 'text', read: () => '还没有注册任何开关：业务用 defineDevFlag / defineDevChoice 声明' })
  items.push({
    kind: 'action',
    label: '全部恢复默认',
    run: () => updateDevSettings({ flags: {}, choices: {} }),
  })
  return items
}
