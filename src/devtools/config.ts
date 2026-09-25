import type Phaser from 'phaser'
import type { DevLayout, DevTheme, DevToolsConfig } from './types'

export interface ResolvedConfig {
  readonly key: string
  readonly storageKey: string
  readonly hotkey: string | null
  readonly title: string
  readonly font: string
  readonly mono: string
  readonly size: number
  readonly accent: number
  readonly layout: (scene: Phaser.Scene) => DevLayout
  readonly onTap: () => void
}

let current: ResolvedConfig | undefined

function defaultLayout(scene: Phaser.Scene): DevLayout {
  return {
    width: scene.scale.width,
    height: scene.scale.height,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    textResolution: 1,
  }
}

export function setDevConfig(cfg: DevToolsConfig): ResolvedConfig {
  current = {
    key: cfg.key ?? 'devtools',
    storageKey: cfg.storageKey ?? 'devtools',
    hotkey: cfg.hotkey === undefined ? 'BACKTICK' : cfg.hotkey,
    title: cfg.title ?? 'DevTools',
    font: cfg.font?.family ?? 'system-ui, sans-serif',
    mono: cfg.font?.mono ?? 'ui-monospace, Menlo, Consolas, monospace',
    size: cfg.font?.size ?? 16,
    accent: cfg.accent ?? 0xffd54f,
    layout: cfg.layout ?? defaultLayout,
    onTap: cfg.onTap ?? ((): void => {}),
  }
  return current
}

export function maybeDevConfig(): ResolvedConfig | undefined {
  return current
}

export function devConfig(): ResolvedConfig {
  if (!current) throw new Error('devtools 尚未安装：先调用 installDevTools')
  return current
}

export function themeOf(cfg: ResolvedConfig, res: number): DevTheme {
  return {
    font: cfg.font,
    mono: cfg.mono,
    caption: Math.round(cfg.size * 0.9),
    body: cfg.size,
    strong: Math.round(cfg.size * 1.2),
    accent: cfg.accent,
    res,
  }
}

let layout: DevLayout | undefined

export function setCurrentLayout(l: DevLayout): void {
  layout = l
}

export function currentLayout(): DevLayout | undefined {
  return layout
}
