import { sineEaseOut } from './ease'
import { Swing, Thrust } from '../components'
import type { Sim } from '../sim'

export function reachOf(e: number): number {
  return Thrust.reach[e]! + Thrust.hitRadius[e]!
}

export function lungeT(sim: Sim, e: number, thrustMs: number): number {
  const half = thrustMs / 2
  if (Swing.durMs[e] === 0 || half <= 0) return 0
  const p = (sim.fxMs - Swing.startMs[e]!) / half
  if (p >= 2) return 0
  return sineEaseOut(p <= 1 ? p : 2 - p)
}
