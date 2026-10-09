import { sineEaseInOut, sineEaseOut } from './ease'
import { Swing } from '../components'
import type { Sim } from '../sim'

/** 突刺的前伸进度：前半段伸出、后半段收回 */
export function lungeT(sim: Sim, e: number, ms: number): number {
  const half = ms / 2
  if (Swing.durMs[e] === 0 || half <= 0) return 0
  const p = (sim.fxMs - Swing.startMs[e]!) / half
  if (p >= 2) return 0
  return sineEaseOut(p <= 1 ? p : 2 - p)
}

/** 横扫的进度：从 -1 扫到 1 */
export function sweepT(sim: Sim, e: number, ms: number): number {
  if (Swing.durMs[e] === 0 || ms <= 0) return 1
  const p = (sim.fxMs - Swing.startMs[e]!) / ms
  if (p >= 1) return 1
  return -1 + 2 * sineEaseInOut(p)
}
