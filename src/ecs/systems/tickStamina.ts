import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { STAMINA } from '../../data/stamina'
import { Airborne, Alive, Drive, Motion, MOTION, Slot, Stamina, Stats, Transform } from '../components'
import { bodyDt } from './shared/body'
import type { Sim } from '../sim'

/** 这一帧自己赶路的距离：闲逛、脚不沾地、被脚本带着走的都不算 */
function walked(sim: Sim, eid: number, dt: number): number {
  if (Drive.idle[eid] || Motion.kind[eid] !== MOTION.none || hasComponent(sim.world, eid, Airborne)) return 0
  return Math.hypot(Drive.x[eid]!, Drive.y[eid]!) * dt
}

/**
 * 赶路按格数扣体力：乘脚下的费力、朝这个方向走的费力倍率与属性表的赶路耗体力。
 * 队员为队长走的路付费，方向按队长走的方向，队长扣全额、其余只扣跟跑的那份；队员自己跟队、找坑的碎步不算。
 * 这一帧没被扣就算在歇，歇满一阵后按体力回复乘脚下的回复倍率先慢后快地回。
 */
export function tickStamina(sim: Sim): void {
  const leader = sim.leader
  const squad = Alive.v[leader] ? walked(sim, leader, bodyDt(sim, leader)) : 0
  for (const eid of query(sim.world, [Stamina, Drive, Transform])) {
    if (!Alive.v[eid]) continue
    const dt = bodyDt(sim, eid)
    if (dt <= 0) continue
    const member = hasComponent(sim.world, eid, Slot)
    const dist = member ? squad : walked(sim, eid, dt)
    const by = member ? leader : eid
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const ground = sim.hooks.surface(sim, x, y)
    const share = member && eid !== leader ? STAMINA.draft : 1
    const cost = dist > 0 ? (dist / UNIT) * ground.exertion * sim.hooks.effort(sim, x, y, Drive.x[by]!, Drive.y[by]!) * Stats.exertion[eid]! * share : 0
    const max = Stats.maxStamina[eid]!
    if (cost > 0) {
      Stamina.used[eid] = Math.min(max, Stamina.used[eid]! + cost)
      Stamina.restMs[eid] = 0
      continue
    }
    const rest = Stamina.restMs[eid]! + dt * 1000
    Stamina.restMs[eid] = rest
    const into = rest - STAMINA.restDelayMs
    if (into <= 0 || Stamina.used[eid]! <= 0) continue
    const regen = Stats.staminaRegen[eid]! * ground.regen * Math.min(1, into / STAMINA.rampMs)
    Stamina.used[eid] = Math.max(0, Math.min(max, Stamina.used[eid]!) - regen * dt)
  }
}
