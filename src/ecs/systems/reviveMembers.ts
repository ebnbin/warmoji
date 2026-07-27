import { Alive, Revive } from '../components'
import { reviveMember } from './shared/combat'
import type { Sim } from '../sim'

/** 阵亡复活轮询(全队阵亡后不复活——待结算) */
export function reviveMembers(sim: Sim): void {
  if (sim.over) return
  const now = sim.elapsedMs
  for (const m of sim.members) {
    if (Alive.v[m]) continue
    if (now < Revive.at[m]!) continue
    reviveMember(sim, m)
  }
}
