import { Hp } from '../../components'
import type { Target } from '../targets'
import type { Sim } from '../../sim'

/** 上限内血量最高的目标（厚血怪优先挨刀） */
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

/** 瞬移端点的残影闪光 */
export function blinkFlash(sim: Sim, x: number, y: number): void {
  sim.pendingCues.push({
    kind: 'circle',
    x,
    y,
    radius: 26,
    o: { fill: 0xb388ff, fillAlpha: 0.4, fromScale: 1, toScale: 1.8, durationMs: 240, depth: 14 },
  })
}
