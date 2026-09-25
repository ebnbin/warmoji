import { CAPTAINS, CAPTAIN_IDS } from '../data/captains'
import type { CaptainId } from '../types/captains'
import type { StringStorage } from '../util/storage'
import { MAPS, MAP_IDS } from '../data/maps'
import type { MapId } from '../types/maps'

function sanitizeMapId(id: unknown): MapId {
  return typeof id === 'string' && id in MAPS ? (id as MapId) : MAP_IDS[0]!
}

const CAPTAIN_KEY = 'warmoji.captain.v1'
const MAP_KEY = 'warmoji.map.v1'

function sanitizeCaptain(id: unknown): CaptainId {
  return typeof id === 'string' && id in CAPTAINS ? (id as CaptainId) : CAPTAIN_IDS[0]!
}

export function loadCaptain(storage: StringStorage | undefined): CaptainId {
  try {
    return sanitizeCaptain(storage?.getItem(CAPTAIN_KEY))
  } catch {
    return sanitizeCaptain(undefined)
  }
}

export function saveCaptain(storage: StringStorage | undefined, id: CaptainId): void {
  try {
    storage?.setItem(CAPTAIN_KEY, id)
  } catch {
  }
}

export function loadMap(storage: StringStorage | undefined): MapId {
  try {
    return sanitizeMapId(storage?.getItem(MAP_KEY))
  } catch {
    return sanitizeMapId(undefined)
  }
}

export function saveMap(storage: StringStorage | undefined, id: MapId): void {
  try {
    storage?.setItem(MAP_KEY, id)
  } catch {
  }
}
