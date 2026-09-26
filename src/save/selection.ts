import { StorageKey } from '../util/storage'
import type { StringStorage } from '../util/storage'
import { MAP_IDS } from '../data/maps'
import type { MapId } from '../types/maps'

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
