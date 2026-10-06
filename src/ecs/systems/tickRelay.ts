import { Alive, Motion, MOTION } from '../components'
import { switchLeader } from './shared/leader'
import type { Sim } from '../sim'

/** 轮换：每隔这一场规则定的时长，把队长交给名单上的下一名活着的队员；交接没完、队长或接手的人正在动作就等一等 */
export function tickRelay(sim: Sim): void {
  const f = sim.fight
  const every = f.rules.relay
  if (every <= 0 || sim.over || sim.handover || sim.elapsedMs - f.relayAt < every) return
  const lead = sim.leader
  const n = sim.characters.length
  const from = sim.characters.indexOf(lead)
  for (let k = 1; k < n; k++) {
    const m = sim.characters[(from + k) % n]!
    if (!Alive.v[m]) continue
    if (Motion.kind[lead] !== MOTION.none || Motion.kind[m] !== MOTION.none) return
    switchLeader(sim, m)
    break
  }
  f.relayAt = sim.elapsedMs
}
