import { query, removeEntity } from 'bitecs'
import { Lifetime, Modifier } from '../components'
import { foldMods } from '../entities/modifier'
import type { Sim } from '../sim'

/** 散掉到期的限时层，有层散掉才重折乘区（没变化就免折，与旧实现同） */
export function refoldBattleFx(sim: Sim): void {
  let expired = false
  for (const eid of [...query(sim.world, [Modifier, Lifetime])]) {
    if (sim.elapsedMs < Lifetime.until[eid]!) continue
    removeEntity(sim.world, eid)
    expired = true
  }
  if (expired) sim.battleFx = foldMods(sim)
}
