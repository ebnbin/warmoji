import { StorageKey } from '../util/storage'
import type { StringStorage } from '../util/storage'
import { MAP_IDS } from '../data/maps'
import { MUTATOR_IDS } from '../data/mutators'
import type { MapId } from '../types/maps'
import type { MutatorId } from '../types/runs'

function sanitizeMapId(id: unknown): MapId {
  return MAP_IDS.find((m) => m === id) ?? MAP_IDS[0]!
}

export function loadMap(storage: StringStorage | undefined): MapId {
  try {
    return sanitizeMapId(storage?.getItem(StorageKey.Map))
  } catch {
    return sanitizeMapId(undefined)
  }
}

export function saveMap(storage: StringStorage | undefined, id: MapId): void {
  try {
    storage?.setItem(StorageKey.Map, id)
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
