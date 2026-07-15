import type { StringStorage } from './highscore'

// 全局设置：跨局持久化，改动即时保存。
// 新增选项 = Settings 加字段 + DEFAULT_SETTINGS 补默认值 + SETTING_DEFS 加一行（页面按定义表渲染）。
export interface Settings {
  /** 敌人受击时飘出伤害数字 */
  damageNumbers: boolean
  /** 队员受击时屏幕轻微抖动 */
  hitShake: boolean
  /** 程序化合成音效 */
  sound: boolean
}

export const DEFAULT_SETTINGS: Settings = { damageNumbers: true, hitShake: true, sound: true }

export type SettingKey = keyof Settings

export interface SettingDef {
  readonly key: SettingKey
  readonly icon: string
  readonly label: string
  readonly desc: string
}

export const SETTING_DEFS: readonly SettingDef[] = [
  { key: 'sound', icon: '🔊', label: '音效', desc: '战斗与界面的合成音效' },
  { key: 'damageNumbers', icon: '🔢', label: '伤害数字', desc: '敌人受击时飘出伤害数值' },
  { key: 'hitShake', icon: '📳', label: '受击震屏', desc: '队员受到伤害时轻微抖动画面' },
]

const KEY = 'warmoji.settings.v1'

/** 容忍旧版本/损坏数据：逐字段取合法值，缺省回退默认 */
export function sanitizeSettings(raw: unknown): Settings {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const pick = (k: SettingKey): boolean =>
    typeof obj[k] === 'boolean' ? (obj[k] as boolean) : DEFAULT_SETTINGS[k]
  return { damageNumbers: pick('damageNumbers'), hitShake: pick('hitShake'), sound: pick('sound') }
}

export function loadSettings(storage: StringStorage | undefined): Settings {
  if (!storage) return { ...DEFAULT_SETTINGS }
  try {
    return sanitizeSettings(JSON.parse(storage.getItem(KEY) ?? 'null'))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(storage: StringStorage | undefined, settings: Settings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings))
  } catch {
    // 隐私模式/配额写入失败可忽略
  }
}
