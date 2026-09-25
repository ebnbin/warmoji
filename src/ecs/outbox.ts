import type { FieldPickupDef } from '../types/battlefield'

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
}

export function newOutbox(): Outbox {
  return { flash: null, bursts: [], collects: [] }
}

export function drain<T>(q: T[], f: (items: readonly T[]) => void): void {
  if (q.length === 0) return
  f(q)
  q.length = 0
}
