import type { StringStorage } from '../util/storage'

// 新增选项须同步：Settings 字段 + DEFAULT_SETTINGS 默认值 + SETTING_DEFS 一行
export interface Settings {
  damageNumbers: boolean
  hitShake: boolean
  sound: boolean
  bgm: boolean
  /** 肤色变体是否展示；component 不受影响 */
  showSkinTone: boolean
  /** 用 ECS 战斗；设置页与开发者面板同写此字段 */
  ecs: boolean
  /** 只决定开发者工具是否露出，不影响战斗行为 */
  devMode: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  damageNumbers: true,
  hitShake: true,
  sound: true,
  bgm: true,
  showSkinTone: false,
  ecs: false,
  devMode: false,
}

export type SettingKey = keyof Settings

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
  { key: 'ecs', icon: '1f9ea', label: 'ECS 实验战斗', desc: 'bitECS + 自绘渲染管线的实验战斗（默认关）' },
  { key: 'devMode', icon: '1f527', label: '开发者模式', desc: '解锁地图页的试炼场入口与战斗内开发者面板' },
]

const KEY = 'warmoji.settings.v1'

/** 逐字段取合法值，缺省回退默认 */
export function sanitizeSettings(raw: unknown): Settings {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const pick = (k: SettingKey): boolean =>
    typeof obj[k] === 'boolean' ? (obj[k] as boolean) : DEFAULT_SETTINGS[k]
  return {
    damageNumbers: pick('damageNumbers'),
    hitShake: pick('hitShake'),
    sound: pick('sound'),
    bgm: pick('bgm'),
    showSkinTone: pick('showSkinTone'),
    ecs: pick('ecs'),
    devMode: pick('devMode'),
  }
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
