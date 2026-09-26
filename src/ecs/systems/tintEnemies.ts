import { query } from 'bitecs'
import { Casting, Dancing, Dormant, ENEMY_SET, Flash, Poison, Slow, TELEGRAPH, Tint } from '../components'
import type { Sim } from '../sim'

function castingTint(now: number, eid: number): number {
  if (Casting.telegraph[eid] === TELEGRAPH.blink) return now % 240 < 120 ? 0xffffff : 0xff5252
  return 0xffb74d
}

export function tintEnemies(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (Dormant.v[eid] || Flash.until[eid] !== 0) continue
    Tint.effect[eid] = 0
    Tint.color[eid] = Dancing.until[eid] !== 0
      ? 0xff9ff3
      : now < Poison.until[eid]!
        ? 0x7bff5a
        : now < Casting.until[eid]!
          ? castingTint(now, eid)
          : now < Slow.until[eid]! && Slow.mul[eid]! < 1
            ? 0xa5d8ff
            : 0xffffff
  }
}
