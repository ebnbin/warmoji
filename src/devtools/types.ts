import type { ReactNode } from 'react'

export interface DevOption {
  readonly id: string
  readonly label: string
  readonly desc?: string
}

export interface DevTextItem {
  readonly kind: 'text'
  readonly label?: string
  readonly desc?: string
  readonly mono?: boolean
  readonly read: () => string
}

export interface DevActionItem {
  readonly kind: 'action'
  readonly label: string
  readonly desc?: string
  readonly run: () => void
}

export interface DevToggleItem {
  readonly kind: 'toggle'
  readonly label: string
  readonly desc?: string
  readonly get: () => boolean
  readonly set: (on: boolean) => void
}

/** 选项带 desc 时按行列出，否则排成一排 */
export interface DevChoiceItem {
  readonly kind: 'choice'
  readonly label: string
  readonly desc?: string
  readonly options: readonly DevOption[]
  readonly get: () => string
  readonly set: (id: string) => void
}

export interface DevMultiItem {
  readonly kind: 'multi'
  readonly label: string
  readonly desc?: string
  readonly options: readonly DevOption[]
  readonly has: (id: string) => boolean
  readonly toggle: (id: string) => void
}

export interface DevButtonsItem {
  readonly kind: 'buttons'
  readonly label?: string
  readonly desc?: string
  readonly buttons: readonly { readonly label: string; readonly run: () => void }[]
}

/** 每次重建条目都会再调用 render：返回同一种组件，React 才保留它的状态 */
export interface DevCustomItem {
  readonly kind: 'custom'
  readonly label?: string
  readonly desc?: string
  readonly render: () => ReactNode
}

export type DevItem = DevTextItem | DevActionItem | DevToggleItem | DevChoiceItem | DevMultiItem | DevButtonsItem | DevCustomItem

export interface DevTab {
  readonly id: string
  readonly title: string
  /** 页签名后面的短文本，如未读数 */
  readonly badge?: () => string
  readonly items: () => readonly DevItem[]
}

/** 面板分三层：当前活动 scene 的、游戏的、引擎的；引擎层只放任何 Phaser 游戏都用得上的能力 */
export type DevLayer = 'scene' | 'game' | 'engine'

export interface DevSceneTabs {
  /** 同时有几个 scene 带页签时，用它分开 */
  readonly title: string
  readonly tabs: readonly DevTab[]
}

/** scene 实现它：活动时页签出现在场景层，CREATE 时注册、SHUTDOWN 时注销 */
export interface DevTabsHost {
  devTabs(): DevSceneTabs
}

export interface DevToolsConfig {
  /** 覆盖层 scene 的 key */
  readonly key?: string
  readonly storageKey?: string
  /** KeyboardEvent.code；null 关闭快捷键 */
  readonly hotkey?: string | null
  readonly title?: string
  /** size 是面板字号，CSS 像素 */
  readonly font?: { readonly family?: string; readonly mono?: string; readonly size?: number }
  readonly accent?: number
  /** 构建号显示在面板标题旁，悬停看构建时间 */
  readonly build?: { readonly hash: string; readonly time: string }
  /** 面板停靠方式变了时调用：宿主重新排版，排版时经 layoutDock 取游戏区 */
  readonly relayout?: () => void
}
