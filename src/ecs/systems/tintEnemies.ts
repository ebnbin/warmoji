import { query } from 'bitecs'
import { Casting, Dormant, ENEMY_SET, Flash, MARK, TELEGRAPH, Tint } from '../components'
import { hasMark, slowFactor } from '../utils/marks'
import type { Sim } from '../sim'

function castingTint(now: number, eid: number): number {
  if (Casting.telegraph[eid] === TELEGRAPH.blink) return now % 240 < 120 ? 0xffffff : 0xff5252
  return 0xffb74d
}

/** 敌人的底色按状态优先级：定身、中毒、蓄力、减速、正常；受击闪白期间不改 */
export function tintEnemies(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (Dormant.v[eid] || Flash.until[eid] !== 0) continue
    Tint.effect[eid] = 0
    Tint.color[eid] = hasMark(sim, eid, MARK.stun)
      ? 0xff9ff3
      : hasMark(sim, eid, MARK.poison)
        ? 0x7bff5a
        : now < Casting.until[eid]!
          ? castingTint(now, eid)
          : slowFactor(sim, eid) < 1
            ? 0xa5d8ff
            : 0xffffff
  }
}
