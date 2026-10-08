import type Phaser from 'phaser'
import type { DevLayout, DevToolsConfig } from './types'

export interface ResolvedConfig {
  readonly key: string
  readonly storageKey: string
  readonly hotkey: string | null
  readonly title: string
  readonly font: string
  readonly mono: string
  readonly size: number
  readonly accent: number
  readonly build: { readonly hash: string; readonly time: string } | null
  readonly layout: (scene: Phaser.Scene) => DevLayout
  readonly relayout: () => void
  readonly onTap: () => void
}

let current: ResolvedConfig | undefined

function defaultLayout(scene: Phaser.Scene): DevLayout {
  return {
    width: scene.scale.width,
    height: scene.scale.height,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  }
}

export function setDevConfig(cfg: DevToolsConfig): ResolvedConfig {
  current = {
    key: cfg.key ?? 'devtools',
    storageKey: cfg.storageKey ?? 'devtools',
    hotkey: cfg.hotkey === undefined ? 'Backquote' : cfg.hotkey,
    title: cfg.title ?? 'DevTools',
    font: cfg.font?.family ?? 'system-ui, sans-serif',
    mono: cfg.font?.mono ?? 'ui-monospace, Menlo, Consolas, monospace',
    size: cfg.font?.size ?? 13,
    accent: cfg.accent ?? 0xffd54f,
    build: cfg.build ?? null,
    layout: cfg.layout ?? defaultLayout,
    relayout: cfg.relayout ?? ((): void => {}),
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

let layout: DevLayout | undefined

export function setCurrentLayout(l: DevLayout): void {
  layout = l
}

export function currentLayout(): DevLayout | undefined {
  return layout
}
