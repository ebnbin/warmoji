import { Hp } from '../components'
import type { Found } from './targets'

export function strongestTarget(ox: number, oy: number, list: readonly Found[], maxRange: number): Found | null {
  const r2 = maxRange * maxRange
  let best: Found | null = null
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
