import { query } from 'bitecs'
import { Boss, Dance, DanceWindow, ENEMY_SET, EState, Tint } from '../components'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

/** 出手瞬间打断在场者的蓄力/冲刺 */
export function castDances(sim: Sim): void {
  castScan(sim, Dance, (e) => {
    DanceWindow.until[sim.captain] = sim.elapsedMs + Dance.durationMs[e]!
    for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
      if (EState.v[eid] !== 2 && EState.v[eid] !== 3) continue
      EState.v[eid] = Boss.v[eid] ? 1 : 0
      Tint.effect[eid] = 0
      Tint.color[eid] = 0xffffff
    }
  })
}
