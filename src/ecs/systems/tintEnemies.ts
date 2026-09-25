import { query } from 'bitecs'
import { Dormant, ENEMY_SET, EState, Flash, Poison, Tint, ZoneSlow } from '../components'
import type { Sim } from '../sim'
import { isDancing } from '../utils/team'

export function tintEnemies(sim: Sim): void {
  const now = sim.elapsedMs
  const dancing = isDancing(sim)
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid] || Flash.until[eid] !== 0) continue
    Tint.effect[eid] = 0
    Tint.color[eid] = dancing
      ? 0xff9ff3
      : now < Poison.until[eid]!
        ? 0x7bff5a
        : EState.v[eid] === 2
          ? 0xffb74d
          : ZoneSlow.v[eid]! < 1
            ? 0xa5d8ff
            : 0xffffff
  }
}
