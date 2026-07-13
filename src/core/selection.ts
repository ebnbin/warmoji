import type { CharacterId } from './config'
import { CHARACTERS, ROSTER_IDS, TEAM } from './config'
import type { StringStorage } from './highscore'

const KEY = 'warmoji.lineup.v1'

/** 过滤非法/重复 id 并截断到队伍上限；全空时回退默认阵容（花名册前 size 名） */
export function sanitizeLineup(ids: unknown): CharacterId[] {
  const valid = Array.isArray(ids)
    ? [...new Set(ids)].filter((x): x is CharacterId => typeof x === 'string' && x in CHARACTERS)
    : []
  if (valid.length === 0) return ROSTER_IDS.slice(0, TEAM.size)
  return valid.slice(0, TEAM.size)
}

/** 选/弃切换；满员时忽略新增 */
export function toggleLineup(sel: readonly CharacterId[], id: CharacterId): CharacterId[] {
  if (sel.includes(id)) return sel.filter((x) => x !== id)
  if (sel.length >= TEAM.size) return [...sel]
  return [...sel, id]
}

export function loadLineup(storage: StringStorage | undefined): CharacterId[] {
  if (!storage) return sanitizeLineup(undefined)
  try {
    return sanitizeLineup(JSON.parse(storage.getItem(KEY) ?? 'null'))
  } catch {
    return sanitizeLineup(undefined)
  }
}

export function saveLineup(storage: StringStorage | undefined, ids: readonly CharacterId[]): void {
  try {
    storage?.setItem(KEY, JSON.stringify(ids))
  } catch {
    // 隐私模式/配额写入失败可忽略
  }
}
