import Phaser from 'phaser'
import type { DevProvider, DevScope } from './types'

export const REGISTRY_CHANGED = 'changed'
export const PANEL_REFRESH = 'refresh'
export const registryEvents = new Phaser.Events.EventEmitter()

export interface DevProviderEntry {
  readonly provider: DevProvider
  readonly scope: DevScope
  readonly seq: number
  /** scene 作用域时为 scene key */
  readonly owner?: string
}

const entries: DevProviderEntry[] = []
let serial = 0

export function registerDevProvider(provider: DevProvider, scope: DevScope, owner?: string): () => void {
  if (entries.some((e) => e.scope === scope && e.provider.id === provider.id)) {
    throw new Error(`devtools provider id 重复：${scope}/${provider.id}`)
  }
  const ids = new Set<string>()
  for (const s of provider.sections) {
    if (ids.has(s.id)) throw new Error(`devtools provider ${provider.id} 的页签 id 重复：${s.id}`)
    ids.add(s.id)
  }
  const entry: DevProviderEntry = { provider, scope, seq: serial++, owner }
  entries.push(entry)
  registryEvents.emit(REGISTRY_CHANGED)
  return () => {
    const i = entries.indexOf(entry)
    if (i < 0) return
    entries.splice(i, 1)
    registryEvents.emit(REGISTRY_CHANGED)
  }
}

export function listDevProviders(scope: DevScope): DevProviderEntry[] {
  return entries.filter((e) => e.scope === scope).sort((a, b) => a.seq - b.seq)
}

export function refreshDevPanel(): void {
  registryEvents.emit(PANEL_REFRESH)
}
