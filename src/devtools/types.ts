import type Phaser from 'phaser'
import type { ReactNode } from 'react'

export interface DevOption {
  readonly id: string
  readonly label: string
  readonly desc?: string
}

export interface DevTextItem {
  readonly kind: 'text'
  readonly label?: string
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

/** 选项带 desc 时按行渲染，否则渲染为 chips */
export interface DevChoiceItem {
  readonly kind: 'choice'
  readonly label: string
  readonly options: readonly DevOption[]
  readonly get: () => string
  readonly set: (id: string) => void
}

export interface DevFlagsItem {
  readonly kind: 'flags'
  readonly label: string
  readonly options: readonly DevOption[]
  readonly has: (id: string) => boolean
  readonly toggle: (id: string) => void
}

export interface DevButtonsItem {
  readonly kind: 'buttons'
  readonly label?: string
  readonly buttons: readonly { readonly label: string; readonly run: () => void }[]
}

/** 每次重建条目都会再调用 render：返回同一种组件，React 才保留它的状态 */
export interface DevCustomItem {
  readonly kind: 'custom'
  readonly render: () => ReactNode
}

export type DevItem = DevTextItem | DevActionItem | DevToggleItem | DevChoiceItem | DevFlagsItem | DevButtonsItem | DevCustomItem

export interface DevSection {
  readonly id: string
  readonly title: string
  /** 显示在页签名后面的短文本，如未读数 */
  readonly badge?: () => string
  readonly items: () => readonly DevItem[]
}

/** 面板分三组：当前 scene 注册的、游戏级的、引擎内置的 */
export type DevScope = 'scene' | 'game' | 'engine'

export interface DevProvider {
  readonly id: string
  readonly title: string
  readonly sections: readonly DevSection[]
}

/** scene 实现它即自动在 CREATE 时注册、SHUTDOWN 时注销 */
export interface DevProviderHost {
  devProvider(): DevProvider
}

export interface DevInsets {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

export interface DevLayout {
  readonly width: number
  readonly height: number
  readonly insets: DevInsets
}

export interface DevToolsConfig {
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
  /** 覆盖层每次布局时调用；须把 scene 主相机设置成与宿主其他场景一致 */
  readonly layout?: (scene: Phaser.Scene) => DevLayout
  /** 面板停靠方式变了时调用：宿主重新排版，排版时经 layoutDock 取游戏区 */
  readonly relayout?: () => void
  readonly onTap?: () => void
}
