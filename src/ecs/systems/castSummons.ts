import { spawnBee } from '../entities/minion'
import { cooldownMul } from '../utils/amp'
import { Summon } from '../components'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

export function castSummons(sim: Sim): void {
  castScan(sim, Summon, (e) => {
    const count = Summon.count[e]!
    for (let i = 0; i < count; i++) spawnBee(sim, e, i)
    Summon.cdLeft[e] = Summon.intervalMs[e]! * cooldownMul(sim, e)
  })
}
