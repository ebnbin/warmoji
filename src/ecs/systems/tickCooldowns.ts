import { query } from 'bitecs'
import { Ability, Cd, Frozen, Motion, MOTION, Owner, Thrown, WindupState } from '../components'
import { cooldownMul } from '../utils/amp'
import type { Sim } from '../sim'

/** 冷却只在身体空下来时走：蓄力中、冲刺中、飞返体未回收都按在满值上，动作做完才开始计时 */
export function tickCooldowns(sim: Sim): void {
  const dt = sim.wdtMs
  for (const e of query(sim.world, [Ability, Cd, Frozen, Owner])) {
    if (Frozen.v[e]) continue
    const o = Owner.eid[e]!
    const held = WindupState.until[e]! > 0 || Thrown.n[e]! > 0 || (Motion.kind[o] !== MOTION.none && Motion.skill[o] === e)
    Cd.left[e] = held ? Math.max(Cd.left[e]!, Cd.base[e]! * cooldownMul(sim, e)) : Cd.left[e]! - dt
  }
}
