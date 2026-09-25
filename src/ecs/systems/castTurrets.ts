import { Turret } from '../components'
import { cooldownMul } from '../utils/amp'
import { place } from '../entities/minion'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

export function castTurrets(sim: Sim): void {
  castScan(sim, Turret, (e) => {
    place(sim, e)
    Turret.cdLeft[e] = Turret.placeIntervalMs[e]! * cooldownMul(sim, e)
  })
}
