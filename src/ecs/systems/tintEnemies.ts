import { query } from 'bitecs'
import { Dancing, Dormant, ENEMY_SET, EState, Flash, Poison, Slow, Tint } from '../components'
import type { Sim } from '../sim'

export function tintEnemies(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (Dormant.v[eid] || Flash.until[eid] !== 0) continue
    Tint.effect[eid] = 0
    Tint.color[eid] = Dancing.until[eid] !== 0
      ? 0xff9ff3
      : now < Poison.until[eid]!
        ? 0x7bff5a
        : EState.v[eid] === 2
          ? 0xffb74d
          : now < Slow.until[eid]! && Slow.mul[eid]! < 1
            ? 0xa5d8ff
            : 0xffffff
  }
}
