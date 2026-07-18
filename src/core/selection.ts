import type { CaptainId } from './config'
import { CAPTAIN_IDS, CAPTAINS } from './config'
import type { StringStorage } from './storage'
import type { MapId } from './maps'
import { sanitizeMapId } from './maps'

// 跨局持久化的只有地图与队长选择；阵容不再持久化——开局招募与波末整编
// 走同一套强制流程（PromoteScene），每局从空阵容按点数现招。
const CAPTAIN_KEY = 'warmoji.captain.v1'
const MAP_KEY = 'warmoji.map.v1'

export function sanitizeCaptain(id: unknown): CaptainId {
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
    // 隐私模式/配额写入失败可忽略
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
    // 隐私模式/配额写入失败可忽略
  }
}
