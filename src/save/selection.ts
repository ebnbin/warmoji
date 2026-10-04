import { StorageKey } from '../util/storage'
import type { StringStorage } from '../util/storage'
import { MUTATOR_IDS } from '../data/mutators'
import type { MapId } from '../types/maps'
import type { MutatorId } from '../types/runs'

type MapKey = StorageKey.Map | StorageKey.BoxMap

export function loadMap(storage: StringStorage | undefined, key: MapKey, maps: readonly MapId[]): MapId {
  try {
    const id = storage?.getItem(key)
    return maps.find((m) => m === id) ?? maps[0]!
  } catch {
    return maps[0]!
  }
}

export function saveMap(storage: StringStorage | undefined, key: MapKey, id: MapId): void {
  try {
    storage?.setItem(key, id)
  } catch {
  }
}

/** 上次勾选的词缀 */
export function loadMutators(storage: StringStorage | undefined): MutatorId[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(StorageKey.Mutators) ?? '[]')
    return Array.isArray(parsed) ? MUTATOR_IDS.filter((id) => parsed.includes(id)) : []
  } catch {
    return []
  }
}

export function saveMutators(storage: StringStorage | undefined, ids: readonly MutatorId[]): void {
  try {
    storage?.setItem(StorageKey.Mutators, JSON.stringify(ids))
  } catch {
  }
}
