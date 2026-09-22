import { TimeStop } from '../components'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

export function castTimeStops(sim: Sim): void {
  castScan(sim, TimeStop, (e) => {
    sim.timeStopMsLeft = TimeStop.durationMs[e]!
  })
}
