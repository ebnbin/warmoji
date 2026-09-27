import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { STAMINA } from '../../data/stamina'
import { Airborne, Alive, Drive, Motion, MOTION, Slot, Stamina, Transform } from '../components'
import { bodyDt } from './shared/body'
import type { Sim } from '../sim'

/** 这一帧自己赶路的距离：闲逛、脚不沾地、被脚本带着走的都不算 */
function walked(sim: Sim, eid: number, dt: number): number {
  if (Drive.idle[eid] || Motion.kind[eid] !== MOTION.none || hasComponent(sim.world, eid, Airborne)) return 0
  return Math.hypot(Drive.x[eid]!, Drive.y[eid]!) * dt
}

/** 赶路按距离乘脚下的费力扣体力，队员最多扣到队伍这一帧前进的距离；这一帧没被扣就算在歇，歇满一阵后先慢后快地回 */
export function tickStamina(sim: Sim): void {
  const leader = sim.leader
  const squad = Alive.v[leader] ? walked(sim, leader, bodyDt(sim, leader)) : 0
  for (const eid of query(sim.world, [Stamina, Drive, Transform])) {
    if (!Alive.v[eid]) continue
    const dt = bodyDt(sim, eid)
    if (dt <= 0) continue
    const own = walked(sim, eid, dt)
    const dist = hasComponent(sim.world, eid, Slot) ? Math.min(own, squad) : own
    const cost = dist > 0 ? (sim.hooks.surface(sim, Transform.x[eid]!, Transform.y[eid]!).exertion * dist) / UNIT : 0
    if (cost > 0) {
      Stamina.v[eid] = Math.max(0, Stamina.v[eid]! - cost)
      Stamina.restMs[eid] = 0
      continue
    }
    const rest = Stamina.restMs[eid]! + dt * 1000
    Stamina.restMs[eid] = rest
    const into = rest - STAMINA.restDelayMs
    if (into <= 0 || Stamina.v[eid]! >= 1) continue
    Stamina.v[eid] = Math.min(1, Stamina.v[eid]! + STAMINA.regen * Math.min(1, into / STAMINA.rampMs) * dt)
  }
}
