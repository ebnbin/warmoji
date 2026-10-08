import Phaser from 'phaser'
import { devConfig, maybeDevConfig } from './config'
import type { DevLayer } from './types'

type DevSide = 'left' | 'right'

/** 面板展开时：停靠独占窗口的一边、游戏区随之缩小；悬浮盖在游戏上 */
export type DevMode = 'dock' | 'float'

interface DevSettings {
  open: boolean
  mode: DevMode
  /** 停靠时面板的宽（窗口横着）与高（竖着），CSS 像素；null 时按窗口算 */
  dockW: number | null
  dockH: number | null
  /** 胶囊与悬浮的面板靠哪边 */
  side: DevSide
  /** 胶囊在可用高度上的位置比例 */
  y: number
  layer: DevLayer
  tab: string | null
  flags: Record<string, boolean>
  choices: Record<string, string>
}

export const SETTINGS_CHANGED = 'changed'
export const settingsEvents = new Phaser.Events.EventEmitter()

const DEFAULTS: DevSettings = { open: false, mode: 'dock', dockW: null, dockH: null, side: 'right', y: 1, layer: 'scene', tab: null, flags: {}, choices: {} }

let current: DevSettings | undefined

function sanitize(raw: unknown): DevSettings {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const size = (k: 'dockW' | 'dockH'): number | null => (typeof o[k] === 'number' && Number.isFinite(o[k]) && o[k] > 0 ? o[k] : null)
  const record = <T extends boolean | string>(k: 'flags' | 'choices', type: 'boolean' | 'string'): Record<string, T> => {
    const v = o[k]
    const out: Record<string, T> = {}
    if (typeof v !== 'object' || v === null) return out
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === type) out[key] = val as T
    return out
  }
  return {
    open: typeof o.open === 'boolean' ? o.open : DEFAULTS.open,
    mode: o.mode === 'float' ? 'float' : 'dock',
    dockW: size('dockW'),
    dockH: size('dockH'),
    side: o.side === 'left' ? 'left' : 'right',
    y: typeof o.y === 'number' && Number.isFinite(o.y) ? Math.min(1, Math.max(0, o.y)) : DEFAULTS.y,
    layer: o.layer === 'game' || o.layer === 'engine' ? o.layer : 'scene',
    tab: typeof o.tab === 'string' ? o.tab : null,
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

/** 安装前读取只给默认值且不缓存：模块初始化阶段定义的开关不至于抛错 */
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
