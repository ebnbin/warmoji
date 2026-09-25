import type { CaptainId } from '../types/captains'
import type { CharacterId } from '../types/characters'
import type { StringStorage } from '../util/storage'
import { Rng } from '../util/rng'
import { RECRUIT } from '../data/waves'

const KEY = 'warmoji.recruit.v1'

function loadSeeds(storage: StringStorage | undefined): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(KEY) ?? 'null')
    return typeof raw === 'object' && raw !== null ? (raw as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function saveSeeds(storage: StringStorage | undefined, seeds: Record<string, number>): void {
  try {
    storage?.setItem(KEY, JSON.stringify(seeds))
  } catch {
  }
}

function freshSeed(): number {
  return Math.max(1, Date.now() >>> 0)
}

export function recruitSeed(storage: StringStorage | undefined, captainId: CaptainId): number {
  const seeds = loadSeeds(storage)
  const stored = seeds[captainId]
  let seed = typeof stored === 'number' && Number.isFinite(stored) ? stored >>> 0 : 0
  if (seed === 0) {
    seed = freshSeed()
    seeds[captainId] = seed
    saveSeeds(storage, seeds)
  }
  return seed
}

export function refreshRecruitSeed(storage: StringStorage | undefined, captainId: CaptainId): void {
  const seeds = loadSeeds(storage)
  seeds[captainId] = freshSeed()
  saveSeeds(storage, seeds)
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
