import type { DevToolsConfig } from './types'

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
  readonly relayout: () => void
}

let current: ResolvedConfig | undefined

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
    relayout: cfg.relayout ?? ((): void => {}),
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
