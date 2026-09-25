import { StorageKey } from '../util/storage'
import type { StringStorage } from '../util/storage'

export interface Settings {
  damageNumbers: boolean
  hitShake: boolean
  sound: boolean
  bgm: boolean
  showSkinTone: boolean
}

const DEFAULT_SETTINGS: Settings = {
  damageNumbers: true,
  hitShake: true,
  sound: true,
  bgm: true,
  showSkinTone: false,
}

type SettingKey = keyof Settings

export interface SettingDef {
  readonly key: SettingKey
  readonly icon: string
  readonly label: string
  readonly desc: string
}

export const SETTING_DEFS: readonly SettingDef[] = [
  { key: 'sound', icon: '1f50a', label: '音效', desc: '战斗与界面的合成音效' },
  { key: 'bgm', icon: '1f3b5', label: '背景音乐', desc: '按地图生成的程序化配乐' },
  { key: 'damageNumbers', icon: '1f522', label: '伤害数字', desc: '敌人受击时飘出伤害数值' },
  { key: 'hitShake', icon: '1f4f3', label: '受击震屏', desc: '队员受到伤害时轻微抖动画面' },
  { key: 'showSkinTone', icon: '1f44b_1f3fd', label: '肤色 emoji', desc: '图鉴与 Studio 全部页展示含肤色的 emoji 变体' },
]

function sanitizeSettings(raw: unknown): Settings {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const pick = (k: SettingKey): boolean =>
    typeof obj[k] === 'boolean' ? (obj[k] as boolean) : DEFAULT_SETTINGS[k]
  return {
    damageNumbers: pick('damageNumbers'),
    hitShake: pick('hitShake'),
    sound: pick('sound'),
    bgm: pick('bgm'),
    showSkinTone: pick('showSkinTone'),
  }
}

export function loadSettings(storage: StringStorage | undefined): Settings {
  if (!storage) return { ...DEFAULT_SETTINGS }
  try {
    return sanitizeSettings(JSON.parse(storage.getItem(StorageKey.Settings) ?? 'null'))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(storage: StringStorage | undefined, settings: Settings): void {
  try {
    storage?.setItem(StorageKey.Settings, JSON.stringify(settings))
  } catch {
  }
}
