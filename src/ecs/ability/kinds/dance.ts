import { query } from 'bitecs'
import type { DanceDef } from '../../../types/abilityDefs'
import { Boss, ENEMY_SET, EState, Tint } from '../../components'
import { castScan } from '../systems/cast'
import { KindDance } from '../tags'
import type { Sim } from '../../sim'

/** 全场蹦迪：窗口用 sim 级时刻表达，故窗口内新登场的敌人天然跟着跳；
 * 出手瞬间另打断在场者的蓄力/冲刺中间态 */
export function castDances(sim: Sim): void {
  castScan<DanceDef>(sim, KindDance, (_e, def) => {
    sim.danceEndsAt = sim.elapsedMs + def.durationMs
    for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
      if (EState.v[eid] !== 2 && EState.v[eid] !== 3) continue
      EState.v[eid] = Boss.v[eid] ? 1 : 0
      Tint.effect[eid] = 0
      Tint.color[eid] = 0xffffff
    }
  })
}
