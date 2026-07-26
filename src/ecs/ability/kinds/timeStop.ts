import type { TimeStopDef } from '../../../types/abilityDefs'
import { castScan } from '../systems/cast'
import { KindTimeStop } from '../tags'
import type { Sim } from '../../sim'

/** 时停：只负责按下开关，世界时标的放缩由 stepSim 的时停通道逐帧处理 */
export function castTimeStops(sim: Sim): void {
  castScan<TimeStopDef>(sim, KindTimeStop, (_e, def) => {
    sim.timeStopMsLeft = def.durationMs
  })
}
