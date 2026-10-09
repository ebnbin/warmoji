import { toBack } from '../../run/state'
import { Motion, MOTION, Slot } from '../components'
import { firstUp, switchLeader } from './shared/leader'
import type { Sim } from '../sim'

/** 轮换：每隔这一场规则定的时长，队长排到隐藏顺序的队尾，交给接下来第一个站着的队员；交接没完、队长或接手的人正在动作就等一等 */
export function tickRelay(sim: Sim): void {
  const f = sim.fight
  const every = f.rules.relay
  if (every <= 0 || sim.over || sim.handover || sim.elapsedMs - f.relayAt < every) return
  const lead = sim.leader
  const next = firstUp(sim, lead)
  if (next >= 0) {
    if (Motion.kind[lead] !== MOTION.none || Motion.kind[next] !== MOTION.none) return
    toBack(sim.run, sim.run.roster[Slot.v[lead]!]!)
    switchLeader(sim, next)
  }
  f.relayAt = sim.elapsedMs
}
