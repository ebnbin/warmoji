import { sineEaseInOut } from './ease'
import { Swing } from '../components'
import type { Sim } from '../sim'

/** -1→1，扫完停在 1 */
export function sweepT(sim: Sim, e: number, sweepMs: number): number {
  if (Swing.durMs[e] === 0 || sweepMs <= 0) return 1
  const p = (sim.fxMs - Swing.startMs[e]!) / sweepMs
  if (p >= 1) return 1
  return -1 + 2 * sineEaseInOut(p)
}
