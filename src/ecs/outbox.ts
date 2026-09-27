import type { FieldPickupDef } from '../types/battlefield'
import type { Banner } from '../types/runs'

export interface Burst {
  x: number
  y: number
  count: number
  kind: 'death' | 'coin' | 'puff'
}

export interface Outbox {
  flash: { color: number; alpha: number; durationMs: number } | null
  bursts: Burst[]
  collects: FieldPickupDef[]
  /** 要打出的横幅：精英来袭、头目登场 */
  banners: Banner[]
}

export function newOutbox(): Outbox {
  return { flash: null, bursts: [], collects: [], banners: [] }
}

export function drain<T>(q: T[], f: (items: readonly T[]) => void): void {
  if (q.length === 0) return
  f(q)
  q.length = 0
}
