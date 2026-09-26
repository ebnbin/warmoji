import type { CharacterId } from '../types/characters'
import { StorageKey } from '../util/storage'
import type { StringStorage } from '../util/storage'
import { Rng } from '../util/rng'
import { RECRUIT } from '../data/waves'

function loadSeed(storage: StringStorage | undefined): number {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(StorageKey.Recruit) ?? 'null')
    return typeof raw === 'number' && Number.isFinite(raw) ? raw >>> 0 : 0
  } catch {
    return 0
  }
}

function saveSeed(storage: StringStorage | undefined, seed: number): void {
  try {
    storage?.setItem(StorageKey.Recruit, JSON.stringify(seed))
  } catch {
  }
}

function freshSeed(): number {
  return Math.max(1, Date.now() >>> 0)
}

/** 候选池的种子一局之内固定，本局结束才换 */
export function recruitSeed(storage: StringStorage | undefined): number {
  let seed = loadSeed(storage)
  if (seed === 0) {
    seed = freshSeed()
    saveSeed(storage, seed)
  }
  return seed
}

export function refreshRecruitSeed(storage: StringStorage | undefined): void {
  saveSeed(storage, freshSeed())
}

export function drawRecruitPool(
  seed: number,
  roster: readonly CharacterId[],
  size = RECRUIT.poolSize,
): CharacterId[] {
  const rng = new Rng(seed >>> 0)
  const pool = [...roster]
  const n = Math.max(0, Math.min(size, pool.length))
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng.next() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool.slice(0, n)
}

export function unlockedCount(openSlots: number): number {
  const table = RECRUIT.unlocks
  const idx = Math.max(0, Math.min(table.length - 1, openSlots - 1))
  return Math.min(RECRUIT.poolSize, openSlots <= 0 ? 0 : table[idx]!)
}

export function unlockAt(index: number): number {
  const table = RECRUIT.unlocks
  for (let k = 0; k < table.length; k++) {
    if (table[k]! >= index + 1) return k + 1
  }
  return table.length
}
