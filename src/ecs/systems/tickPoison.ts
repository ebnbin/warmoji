import { query } from 'bitecs'
import { Dormant, Hp, Poison } from '../components'
import { poisonSrc } from '../store'
import { hit } from './shared/damage'
import { WORLD_SOURCE } from '../utils/source'
import type { Sim } from '../sim'

export function tickPoison(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of [...query(sim.world, [Poison, Hp])]) {
    if (Poison.until[eid] === 0 || Dormant.v[eid]) continue
    if (now >= Poison.nextTick[eid]! && Poison.nextTick[eid]! <= Poison.until[eid]!) {
      Poison.nextTick[eid] = Poison.nextTick[eid]! + Poison.tickMs[eid]!
      hit(sim, poisonSrc[eid] ?? WORLD_SOURCE, eid, Poison.dmg[eid]!, { tick: true })
      continue
    }
    if (now >= Poison.until[eid]!) Poison.until[eid] = 0
  }
}
