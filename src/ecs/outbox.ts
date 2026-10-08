import type { FieldPickupDef } from '../types/battlefield'
import type { EntranceLook } from '../types/maps'
import type { Banner } from '../types/runs'
import type { SfxId } from '../types/sfx'

export interface Burst {
  x: number
  y: number
  count: number
  kind: 'death' | 'coin' | EntranceLook
}

export interface Outbox {
  flash: { color: number; alpha: number; durationMs: number } | null
  bursts: Burst[]
  collects: FieldPickupDef[]
  /** 要打出的横幅：精英来袭、头目登场 */
  banners: Banner[]
  /** 要播的音效，按发生顺序 */
  sfx: SfxId[]
}

export function newOutbox(): Outbox {
  return { flash: null, bursts: [], collects: [], banners: [], sfx: [] }
}

export function drain<T>(q: T[], f: (items: readonly T[]) => void): void {
  if (q.length === 0) return
  f(q)
  q.length = 0
}
