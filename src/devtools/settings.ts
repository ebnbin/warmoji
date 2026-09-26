import Phaser from 'phaser'
import { devConfig, maybeDevConfig } from './config'
import type { DevScope } from './types'

type DevSide = 'left' | 'right'

interface DevSettings {
  side: DevSide
  /** 胶囊在可用高度上的位置比例 */
  y: number
  group: DevScope
  tab: string | null
  pillFps: boolean
  safeArea: boolean
  wide: boolean
  flags: Record<string, boolean>
  choices: Record<string, string>
}

export const SETTINGS_CHANGED = 'changed'
export const settingsEvents = new Phaser.Events.EventEmitter()

const DEFAULTS: DevSettings = { side: 'right', y: 1, group: 'scene', tab: null, pillFps: false, safeArea: false, wide: false, flags: {}, choices: {} }

let current: DevSettings | undefined

function sanitize(raw: unknown): DevSettings {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const bool = (k: 'pillFps' | 'safeArea' | 'wide'): boolean => (typeof o[k] === 'boolean' ? o[k] : DEFAULTS[k])
  const y = typeof o.y === 'number' && Number.isFinite(o.y) ? Math.min(1, Math.max(0, o.y)) : DEFAULTS.y
  const record = <T extends boolean | string>(k: 'flags' | 'choices', type: 'boolean' | 'string'): Record<string, T> => {
    const v = o[k]
    const out: Record<string, T> = {}
    if (typeof v !== 'object' || v === null) return out
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === type) out[key] = val as T
    return out
  }
  return {
    side: o.side === 'left' ? 'left' : 'right',
    y,
    group: o.group === 'game' || o.group === 'engine' ? o.group : 'scene',
    tab: typeof o.tab === 'string' ? o.tab : null,
    pillFps: bool('pillFps'),
    safeArea: bool('safeArea'),
    wide: bool('wide'),
    flags: record<boolean>('flags', 'boolean'),
    choices: record<string>('choices', 'string'),
  }
}

function load(key: string): DevSettings {
  try {
    return sanitize(JSON.parse(localStorage.getItem(key) ?? 'null'))
  } catch {
    return { ...DEFAULTS }
  }
}

/** 安装前读取只给默认值且不缓存：模块初始化阶段声明的开关不至于抛错 */
export function devSettings(): DevSettings {
  if (current) return current
  const cfg = maybeDevConfig()
  if (!cfg) return { ...DEFAULTS, flags: {}, choices: {} }
  current = load(cfg.storageKey)
  return current
}

export function updateDevSettings(patch: Partial<DevSettings>): void {
  const s = Object.assign(devSettings(), patch)
  try {
    localStorage.setItem(devConfig().storageKey, JSON.stringify(s))
  } catch {
  }
  settingsEvents.emit(SETTINGS_CHANGED)
}
