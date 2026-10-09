import type { MapEvent } from '../../data/signals'
import type { Sim } from '../sim'

/** 地图上发生了一次这件事：这一场的计数加一，关卡的目标与按事件放出的敌人都数它 */
export function mapEvent(sim: Sim, e: MapEvent): void {
  sim.fight.events[e] = (sim.fight.events[e] ?? 0) + 1
}
