import type Phaser from 'phaser'

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

export interface DevCustomItem {
  readonly kind: 'custom'
  readonly mount: (ctx: DevWidgetContext) => DevWidget
}

export type DevItem = DevTextItem | DevActionItem | DevToggleItem | DevChoiceItem | DevFlagsItem | DevButtonsItem | DevCustomItem

export interface DevTheme {
  readonly font: string
  readonly mono: string
  readonly caption: number
  readonly body: number
  readonly strong: number
  readonly accent: number
  readonly res: number
}

export interface DevWidgetContext {
  readonly scene: Phaser.Scene
  readonly width: number
  readonly theme: DevTheme
}

/** objects 的坐标以部件左上角为原点 */
export interface DevWidget {
  readonly objects: readonly Phaser.GameObjects.GameObject[]
  readonly height: number
  update?(time: number): void
  destroy?(): void
}

export interface DevSection {
  readonly id: string
  readonly title: string
  /** 升序排列；内置页签为 1000 起，业务默认 0 */
  readonly order?: number
  /** 显示在页签名后面的短文本，如未读数 */
  readonly badge?: () => string
  readonly items: () => readonly DevItem[]
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
  readonly textResolution: number
}

export interface DevToolsConfig {
  readonly key?: string
  readonly storageKey?: string
  /** Phaser 键名；null 关闭快捷键 */
  readonly hotkey?: string | null
  readonly title?: string
  readonly font?: { readonly family?: string; readonly mono?: string; readonly size?: number }
  readonly accent?: number
  /** 每次布局时调用；须把 scene 主相机设置成与宿主其他场景一致 */
  readonly layout?: (scene: Phaser.Scene) => DevLayout
  readonly onTap?: () => void
}
