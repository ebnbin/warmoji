import { query } from 'bitecs'
import { Casting, Dormant, ENEMY_SET, Flash, MARK, Pop, TELEGRAPH, Tint } from '../components'
import { hasMark, isHidden, slowFactor } from '../utils/marks'
import { statusTint } from '../utils/statusTint'
import type { Sim } from '../sim'

function castingTint(now: number, eid: number): number {
  if (Casting.telegraph[eid] === TELEGRAPH.blink) return now % 240 < 120 ? 0xffffff : 0xff5252
  return 0xffb74d
}

/** 敌人的底色按状态优先级：控制、中毒、蓄力、减速、正常；受击闪白期间不改；看不见的只剩一层淡影 */
export function tintEnemies(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (Dormant.v[eid]) continue
    if (Pop.until[eid] === 0) Tint.alpha[eid] = isHidden(sim, eid) ? Pop.alpha[eid]! * 0.25 : Pop.alpha[eid]!
    if (Flash.until[eid] !== 0) continue
    Tint.effect[eid] = 0
    const cc = statusTint(sim, eid)
    Tint.color[eid] = cc !== 0
      ? cc
      : hasMark(sim, eid, MARK.poison)
        ? 0x7bff5a
        : now < Casting.until[eid]!
          ? castingTint(now, eid)
          : slowFactor(sim, eid) < 1
            ? 0xa5d8ff
            : 0xffffff
  }
}
