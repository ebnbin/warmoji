import { query } from 'bitecs'
import { Boss, Dance, DanceWindow, ENEMY_SET, EState, Tint } from '../components'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

export function castDances(sim: Sim, scan = castScan): void {
  scan(sim, Dance, (e) => {
    DanceWindow.until[sim.captain] = sim.elapsedMs + Dance.durationMs[e]!
    for (const eid of query(sim.world, ENEMY_SET)) {
      if (EState.v[eid] !== 2 && EState.v[eid] !== 3) continue
      EState.v[eid] = Boss.v[eid] ? 1 : 0
      Tint.effect[eid] = 0
      Tint.color[eid] = 0xffffff
    }
  })
}
