import { } from '../components'
import type { } from '../utils/targets'
import type { Sim } from '../sim'

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
