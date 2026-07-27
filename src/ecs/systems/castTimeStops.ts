import { TimeStop } from '../components'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

/** 时停：只负责按下开关，世界时标的放缩由 stepSim 的时停通道逐帧处理 */
export function castTimeStops(sim: Sim): void {
  castScan(sim, TimeStop, (e) => {
    sim.timeStopMsLeft = TimeStop.durationMs[e]!
  })
}
