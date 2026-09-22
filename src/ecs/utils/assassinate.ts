import { Hp } from '../components'
import type { Target } from './targets'

export function strongestTarget(ox: number, oy: number, list: readonly Target[], maxRange: number): Target | null {
  const r2 = maxRange * maxRange
  let best: Target | null = null
  let bestHp = -1
  for (const t of list) {
    const dx = t.x - ox
    const dy = t.y - oy
    if (dx * dx + dy * dy > r2) continue
    const hp = Hp.v[t.eid] ?? 0
    if (hp > bestHp) {
      bestHp = hp
      best = t
    }
  }
  return best
}
