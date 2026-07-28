import type { StringStorage } from '../util/storage'

// 全局设置：跨局持久化，改动即时保存。
// 新增选项 = Settings 加字段 + DEFAULT_SETTINGS 补默认值 + SETTING_DEFS 加一行（页面按定义表渲染）。
export interface Settings {
  /** 敌人受击时飘出伤害数字 */
  damageNumbers: boolean
  /** 队员受击时屏幕轻微抖动 */
  hitShake: boolean
  /** 程序化合成音效 */
  sound: boolean
  /** 程序化生成的场景配乐 */
  bgm: boolean
  /** 图鉴 / Studio 全部页展示含肤色的 emoji 变体（component 不受影响） */
  showSkinTone: boolean
  /** 实验：用 ECS 框架 + 自绘渲染管线复写的战斗（默认关，旧框架为准；A/B 切换，互不影响）。
   * 不在设置页露出——它的开关在战斗内的开发者面板「性能」页，
   * 就挨着帧读数：A/B 对照要在同一份负载下来回切，回设置页太远也看不到效果 */
  ecs: boolean
  /** 开发者模式：解锁试炼场入口与战斗内开发者面板（默认关）。
   * 与 ecs 正交——它只决定「开发者工具露不露出来」，不影响任何一套战斗的行为 */
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

/** 设置页按本表逐行渲染。**不是所有设置项都在这里**：ecs 只由开发者面板改，
 * 故不列——列了就等于给玩家一个看不懂、也不该动的实验开关 */
export const SETTING_DEFS: readonly SettingDef[] = [
  { key: 'sound', icon: '1f50a', label: '音效', desc: '战斗与界面的合成音效' },
  { key: 'bgm', icon: '1f3b5', label: '背景音乐', desc: '按地图生成的程序化配乐' },
  { key: 'damageNumbers', icon: '1f522', label: '伤害数字', desc: '敌人受击时飘出伤害数值' },
  { key: 'hitShake', icon: '1f4f3', label: '受击震屏', desc: '队员受到伤害时轻微抖动画面' },
  { key: 'showSkinTone', icon: '1f44b_1f3fd', label: '肤色 emoji', desc: '图鉴与 Studio 全部页展示含肤色的 emoji 变体' },
  { key: 'devMode', icon: '1f527', label: '开发者模式', desc: '解锁地图页的试炼场入口与战斗内开发者面板（敌人/规模旋钮 + 实时性能读数 + 框架切换）' },
]

const KEY = 'warmoji.settings.v1'

/** 容忍旧版本/损坏数据：逐字段取合法值，缺省回退默认 */
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
