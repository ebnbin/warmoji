import { query } from 'bitecs'
import { Dormant, ENEMY_SET, Poison } from '../components'
import { applyDamage } from './shared/combat'
import type { Sim } from '../sim'

export function tickPoison(sim: Sim): void {
  const enemies = [...query(sim.world, ENEMY_SET)]
  const now = sim.elapsedMs
  for (const eid of enemies) {
    if (Poison.until[eid] === 0 || Dormant.v[eid]) continue
    if (now >= Poison.nextTick[eid]! && Poison.nextTick[eid]! <= Poison.until[eid]!) {
      Poison.nextTick[eid] = Poison.nextTick[eid]! + Poison.tickMs[eid]!
      applyDamage(sim, eid, Poison.dmg[eid]!, 0, undefined, undefined, Poison.slot[eid]!)
      continue
    }
    if (now >= Poison.until[eid]!) Poison.until[eid] = 0
  }
}
