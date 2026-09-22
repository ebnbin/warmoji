import type { FieldPickupDef } from '../types/battlefield'

// 仿真只写、场景侧每帧排空；排空一律走 drain

/** kind 选发射器 */
export interface Burst {
  x: number
  y: number
  count: number
  kind: 'death' | 'coin' | 'puff'
}

export interface Outbox {
  /** 全屏白闪；后来者覆盖前者 */
  flash: { color: number; alpha: number; durationMs: number } | null
  bursts: Burst[]
  collects: FieldPickupDef[]
}

export function newOutbox(): Outbox {
  return { flash: null, bursts: [], collects: [] }
}

/** f 做没做事都清空 */
export function drain<T>(q: T[], f: (items: readonly T[]) => void): void {
  if (q.length === 0) return
  f(q)
  q.length = 0
}
