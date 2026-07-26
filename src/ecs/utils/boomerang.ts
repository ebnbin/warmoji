import { query } from 'bitecs'
import type { } from '../../types/abilityDefs'
import { } from '../../audio/sfx'
import { Flyer } from '../components'
import { } from '../entities/weapon'
import { } from '../store'
import type { Sim } from '../sim'

/** 在途镖数（主镖自己 + 它的双子） */
export function airborne(sim: Sim, e: number): number {
  let n = 0
  for (const f of query(sim.world, [Flyer])) if (Flyer.of[f] === e) n++
  return n
}
