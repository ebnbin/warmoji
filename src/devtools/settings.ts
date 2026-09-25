import Phaser from 'phaser'
import { devConfig } from './config'

export type DevSide = 'left' | 'right'

export interface DevSettings {
  side: DevSide
  /** 胶囊在可用高度上的位置比例 */
  y: number
  tab: string | null
  pillFps: boolean
  safeArea: boolean
}

export const SETTINGS_CHANGED = 'changed'
export const settingsEvents = new Phaser.Events.EventEmitter()

const DEFAULTS: DevSettings = { side: 'right', y: 1, tab: null, pillFps: false, safeArea: false }

let current: DevSettings | undefined

function sanitize(raw: unknown): DevSettings {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const bool = (k: 'pillFps' | 'safeArea'): boolean => (typeof o[k] === 'boolean' ? o[k] : DEFAULTS[k])
  const y = typeof o.y === 'number' && Number.isFinite(o.y) ? Math.min(1, Math.max(0, o.y)) : DEFAULTS.y
  return {
    side: o.side === 'left' ? 'left' : 'right',
    y,
    tab: typeof o.tab === 'string' ? o.tab : null,
    pillFps: bool('pillFps'),
    safeArea: bool('safeArea'),
  }
}

function load(key: string): DevSettings {
  try {
    return sanitize(JSON.parse(localStorage.getItem(key) ?? 'null'))
  } catch {
    return { ...DEFAULTS }
  }
}

export function devSettings(): DevSettings {
  current ??= load(devConfig().storageKey)
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
