import { RUN_IDS } from '../data/runs'
import type { RunId } from '../types/runs'
import { StorageKey } from '../util/storage'
import type { StringStorage } from '../util/storage'

/** 一关的最好成绩：拿过最多几颗星（0 是还没赢过），赢下时最高的热度，最远打过了几场 */
export interface LabBest {
  readonly stars: number
  readonly heat: number
  readonly reached: number
}

export type LabBests = Partial<Record<RunId, LabBest>>

const num = (o: object, k: string): number => {
  const v: unknown = (o as Record<string, unknown>)[k]
  return typeof v === 'number' ? v : 0
}

export function loadLabs(storage: StringStorage | undefined): LabBests {
  try {
    const raw = storage?.getItem(StorageKey.Labs)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: LabBests = {}
    for (const id of RUN_IDS) {
      const v: unknown = id in parsed ? (parsed as Record<string, unknown>)[id] : undefined
      if (typeof v === 'object' && v !== null) out[id] = { stars: num(v, 'stars'), heat: num(v, 'heat'), reached: num(v, 'reached') }
    }
    return out
  } catch {
    return {}
  }
}

function save(storage: StringStorage | undefined, all: LabBests): void {
  try {
    storage?.setItem(StorageKey.Labs, JSON.stringify(all))
  } catch {
  }
}

/** 赢下一关：星数、热度与打过的场数各记各的最高，返回记下后的成绩与星数或热度有没有破纪录 */
export function submitLab(storage: StringStorage | undefined, id: RunId, stars: number, heat: number, reached: number): { best: LabBest; newStars: boolean; newHeat: boolean } {
  const all = loadLabs(storage)
  const prev = all[id]
  const best = { stars: Math.max(prev?.stars ?? 0, stars), heat: Math.max(prev?.heat ?? 0, heat), reached: Math.max(prev?.reached ?? 0, reached) }
  all[id] = best
  save(storage, all)
  return { best, newStars: stars > (prev?.stars ?? 0), newHeat: heat > (prev?.heat ?? 0) }
}

/** 输了一局：记下最远打过了几场 */
export function reachLab(storage: StringStorage | undefined, id: RunId, reached: number): void {
  const all = loadLabs(storage)
  const prev = all[id]
  all[id] = { stars: prev?.stars ?? 0, heat: prev?.heat ?? 0, reached: Math.max(prev?.reached ?? 0, reached) }
  save(storage, all)
}
