import { RUN_IDS } from '../data/runs'
import type { RunId } from '../types/runs'
import { StorageKey } from '../util/storage'
import type { StringStorage } from '../util/storage'

/** 一关的最好成绩：拿过最多几颗星，赢下时最高的热度 */
export interface LabBest {
  readonly stars: number
  readonly heat: number
}

export type LabBests = Partial<Record<RunId, LabBest>>

export function loadLabs(storage: StringStorage | undefined): LabBests {
  try {
    const raw = storage?.getItem(StorageKey.Labs)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: LabBests = {}
    for (const id of RUN_IDS) {
      const v: unknown = id in parsed ? (parsed as Record<string, unknown>)[id] : undefined
      if (typeof v === 'object' && v !== null && 'stars' in v && typeof v.stars === 'number' && 'heat' in v && typeof v.heat === 'number') out[id] = { stars: v.stars, heat: v.heat }
    }
    return out
  } catch {
    return {}
  }
}

/** 赢下一关：星数与热度各记各的最高，返回记下后的成绩与哪一项破了纪录 */
export function submitLab(storage: StringStorage | undefined, id: RunId, stars: number, heat: number): { best: LabBest; newStars: boolean; newHeat: boolean } {
  const all = loadLabs(storage)
  const prev = all[id]
  const best = { stars: Math.max(prev?.stars ?? 0, stars), heat: Math.max(prev?.heat ?? 0, heat) }
  all[id] = best
  try {
    storage?.setItem(StorageKey.Labs, JSON.stringify(all))
  } catch {
  }
  return { best, newStars: stars > (prev?.stars ?? 0), newHeat: heat > (prev?.heat ?? 0) }
}
