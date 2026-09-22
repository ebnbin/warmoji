import type { Sim } from '../../sim'
import { spawnFxCircle } from '../../entities/fx'

export function blinkFlash(sim: Sim, x: number, y: number): void {
  spawnFxCircle(sim, x, y, 26, { fill: 0xb388ff, fillAlpha: 0.4, fromScale: 1, toScale: 1.8, durationMs: 240, depth: 14 })
}
