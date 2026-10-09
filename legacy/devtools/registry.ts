import Phaser from 'phaser'
import type { DevLayer, DevTab } from './types'

export const REGISTRY_CHANGED = 'changed'
export const PANEL_REFRESH = 'refresh'
export const registryEvents = new Phaser.Events.EventEmitter()

export interface DevTabEntry {
  /** 面板记住选中哪个页签用它 */
  readonly key: string
  readonly layer: DevLayer
  /** 场景层是页签所属 scene 的名字，其余两层为空 */
  readonly owner: string
  readonly tab: DevTab
}

const entries: DevTabEntry[] = []

/** ownerKey 区分同一层里不同来源的页签；返回注销函数 */
export function registerTabs(layer: DevLayer, ownerKey: string, owner: string, tabs: readonly DevTab[]): () => void {
  const added = tabs.map((tab): DevTabEntry => ({ key: `${layer}/${ownerKey}/${tab.id}`, layer, owner, tab }))
  added.forEach((e, i) => {
    if (entries.some((x) => x.key === e.key) || added.findIndex((x) => x.key === e.key) !== i) throw new Error(`开发面板页签重复：${e.key}`)
  })
  entries.push(...added)
  registryEvents.emit(REGISTRY_CHANGED)
  return () => {
    for (const e of added) {
      const i = entries.indexOf(e)
      if (i >= 0) entries.splice(i, 1)
    }
    registryEvents.emit(REGISTRY_CHANGED)
  }
}

/** 只列此刻该出现的 */
export function listTabs(layer: DevLayer): readonly DevTabEntry[] {
  return entries.filter((e) => e.layer === layer && (e.tab.when?.() ?? true))
}

/** 条目的样子取决于面板之外的状态时，状态变了调用它让面板重建 */
export function refreshDevPanel(): void {
  registryEvents.emit(PANEL_REFRESH)
}
