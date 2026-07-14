import type { CaptainId, CharacterId } from './config'
import { CAPTAIN_IDS, CAPTAINS, CHARACTERS, ROSTER_IDS } from './config'
import type { StringStorage } from './highscore'

const LINEUP_KEY = 'warmoji.lineup.v1'
const CAPTAIN_KEY = 'warmoji.captain.v1'

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

/** 过滤非法/重复 id 并截断到首发人数（由队长开局等级决定）；全空时回退花名册前 size 名 */
export function sanitizeLineup(ids: unknown, size: number): CharacterId[] {
  const valid = Array.isArray(ids)
    ? [...new Set(ids)].filter((x): x is CharacterId => typeof x === 'string' && x in CHARACTERS)
    : []
  if (valid.length === 0) return ROSTER_IDS.slice(0, size)
  return valid.slice(0, size)
}

/** 选/弃切换；满员时替换最早选入的（首发人数通常 1~2，替换比忽略顺手） */
export function toggleLineup(
  sel: readonly CharacterId[],
  id: CharacterId,
  size: number,
): CharacterId[] {
  if (sel.includes(id)) return sel.filter((x) => x !== id)
  if (sel.length >= size) return [...sel.slice(sel.length - size + 1), id]
  return [...sel, id]
}

export function loadLineup(storage: StringStorage | undefined, size: number): CharacterId[] {
  if (!storage) return sanitizeLineup(undefined, size)
  try {
    return sanitizeLineup(JSON.parse(storage.getItem(LINEUP_KEY) ?? 'null'), size)
  } catch {
    return sanitizeLineup(undefined, size)
  }
}

export function saveLineup(storage: StringStorage | undefined, ids: readonly CharacterId[]): void {
  try {
    storage?.setItem(LINEUP_KEY, JSON.stringify(ids))
  } catch {
    // 隐私模式/配额写入失败可忽略
  }
}

/** 一次读出当前队长与按其开局点数截断的首发阵容 */
export function loadTeam(storage: StringStorage | undefined): {
  captainId: CaptainId
  lineup: CharacterId[]
} {
  const captainId = loadCaptain(storage)
  return { captainId, lineup: loadLineup(storage, CAPTAINS[captainId].startLevel) }
}
