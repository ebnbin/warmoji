import { hasComponent, query } from 'bitecs'
import { Built, Emplacement, Retiring } from '../components'
import type { Sim } from '../sim'

/** 某件武器名下仍在役（未退场）的装置 */
export function liveOnes(sim: Sim, e: number): number[] {
  const out: number[] = []
  for (const t of query(sim.world, [Emplacement, Built])) {
    if (Built.by[t] === e && !hasComponent(sim.world, t, Retiring)) out.push(t)
  }
  return out
}
