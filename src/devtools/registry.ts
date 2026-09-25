import Phaser from 'phaser'
import type { DevSection } from './types'

export const REGISTRY_CHANGED = 'changed'
export const PANEL_REFRESH = 'refresh'
export const registryEvents = new Phaser.Events.EventEmitter()

const sections = new Map<string, DevSection>()
const seq = new Map<string, number>()
let serial = 0

export function registerDevSection(def: DevSection): () => void {
  if (sections.has(def.id)) throw new Error(`devtools 页签 id 重复：${def.id}`)
  sections.set(def.id, def)
  seq.set(def.id, serial++)
  registryEvents.emit(REGISTRY_CHANGED)
  return () => {
    if (sections.get(def.id) !== def) return
    sections.delete(def.id)
    seq.delete(def.id)
    registryEvents.emit(REGISTRY_CHANGED)
  }
}

export function sceneDevSection(scene: Phaser.Scene, def: DevSection): void {
  const off = registerDevSection(def)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off)
}

export function listDevSections(): DevSection[] {
  return [...sections.values()].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || (seq.get(a.id) ?? 0) - (seq.get(b.id) ?? 0),
  )
}

export function refreshDevPanel(): void {
  registryEvents.emit(PANEL_REFRESH)
}
