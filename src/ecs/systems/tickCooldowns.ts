import { hasComponent, query } from 'bitecs'
import { Ability, Cd, Charges, Frozen, Manual, Motion, MOTION, Owner, Thrown, WindupState } from '../components'
import { cooldownMul } from '../utils/amp'
import { openStage } from './shared/avail'
import type { Sim } from '../sim'

/** 冷却只在身体空下来时走：蓄力中、自己的冲刺中、飞返体未回收、连段还开着时按在满值上；充能的一次次攒回来；主动技能倒下时也照走 */
export function tickCooldowns(sim: Sim): void {
  const dt = sim.wdtMs
  for (const e of query(sim.world, [Ability, Cd, Frozen, Owner])) {
    if (Frozen.v[e] && !hasComponent(sim.world, e, Manual)) continue
    const o = Owner.eid[e]!
    const base = Cd.base[e]! * cooldownMul(sim, e)
    const held = WindupState.until[e]! > 0 || Thrown.n[e]! > 0 || (Motion.kind[o] !== MOTION.none && Motion.skill[o] === e) || openStage(sim, e) !== 0
    if (hasComponent(sim.world, e, Charges)) {
      if (Charges.n[e]! >= Charges.max[e]! || held) continue
      Cd.left[e] = Cd.left[e]! - dt
      if (Cd.left[e]! > 0) continue
      Charges.n[e] = Charges.n[e]! + 1
      Cd.left[e] = Charges.n[e]! < Charges.max[e]! ? base : 0
      continue
    }
    Cd.left[e] = held ? Math.max(Cd.left[e]!, base) : Cd.left[e]! - dt
  }
}
